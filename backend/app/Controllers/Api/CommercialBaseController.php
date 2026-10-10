<?php

declare(strict_types=1);

namespace App\Controllers\Api;

use App\Controllers\BaseController;
use CodeIgniter\HTTP\ResponseInterface;
use Throwable;

abstract class CommercialBaseController extends BaseController
{
    protected function authorizeAdmin(): ?ResponseInterface
    {
        $user = auth('session')->user();
        if ($user === null || $user->isBanned()) {
            return $this->errorResponse(401, 'Faça login novamente.');
        }
        // Clientes e visitas contêm dados pessoais, nunca retorná-los a vendedor/corretor.
        if (! $user->inGroup('admin') || ! $user->can('visits.manage')) {
            return $this->errorResponse(403, 'Acesso restrito ao administrador.');
        }

        return null;
    }

    protected function authorizeOperations(): ?ResponseInterface
    {
        $user = auth('session')->user();
        if ($user === null || $user->isBanned()) return $this->errorResponse(401, 'Faça login novamente.');
        if (!$user->inGroup('admin') && (!$user->inGroup('operador') || !$user->can('visits.manage') || !$user->can('clients.manage'))) {
            return $this->errorResponse(403, 'Apenas administrador ou operador de atendimentos.');
        }
        return null;
    }

    protected function jsonPayload(): array
    {
        $value = $this->request->getJSON(true);
        return is_array($value) ? $value : [];
    }

    protected function responseOK(string $message, int $status = 200, array $extra = []): ResponseInterface
    {
        return $this->response->setStatusCode($status)->setJSON([
            'message' => $message,
            ...$extra,
            'csrf' => $this->csrfData(),
        ])->setHeader('Cache-Control', 'no-store');
    }

    protected function errorResponse(int $status, string $message): ResponseInterface
    {
        return $this->response->setStatusCode($status)->setJSON([
            'message' => $message,
            'csrf' => $this->csrfData(),
        ])->setHeader('Cache-Control', 'no-store');
    }

    protected function csrfData(): array
    {
        return [
            'header' => config('Security')->headerName,
            'hash' => csrf_hash(),
        ];
    }

    protected function unexpected(Throwable $e, string $context): ResponseInterface
    {
        log_message('error', 'SPLASH {context}: {message}', [
            'context' => $context,
            'message' => $e->getMessage(),
        ]);
        return $this->errorResponse(500, 'Não foi possível concluir. Confira os logs do backend.');
    }

    protected function commitOrFail($db): void
    {
        if ($db->transStatus() === false) {
            throw new \RuntimeException('Falha na transação do banco.');
        }
        $db->transCommit();
    }

    protected function validateDate($value, bool $allowFuture = true): bool
    {
        if (!is_string($value) || !preg_match('/^\d{4}-\d{2}-\d{2}$/D', $value)) return false;
        $dt = \DateTimeImmutable::createFromFormat('!Y-m-d', $value);
        if (!$dt || $dt->format('Y-m-d') !== $value || (int)$dt->format('Y') < 1900) return false;
        if (!$allowFuture && $value > date('Y-m-d')) return false;
        return true;
    }

    protected function optionalId($value): int|false|null
    {
        if ($value === null || $value === '') return null;
        $parsed = filter_var($value, FILTER_VALIDATE_INT, ['options'=>['min_range'=>1]]);
        return $parsed === false ? false : (int)$parsed;
    }

    protected function cleanText($value, int $max, bool $required=false): string|false|null
    {
        if (!is_string($value) && !is_numeric($value) && $value !== null) return false;
        $trimmed = trim((string)$value);
        if (($required && $trimmed === '') || mb_strlen($trimmed)>$max) return false;
        return $trimmed === '' ? null : $trimmed;
    }
}
