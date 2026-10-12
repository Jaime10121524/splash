<?php
declare(strict_types=1);

namespace App\Filters;

use CodeIgniter\Filters\FilterInterface;
use CodeIgniter\HTTP\RequestInterface;
use CodeIgniter\HTTP\ResponseInterface;

/**
 * Exceção EXATA para as duas origens do WebView Capacitor.
 * Desativada por padrão. Jamais usar Access-Control-Allow-Origin: * com sessão.
 */
final class CapacitorCors implements FilterInterface
{
    private function allowed(RequestInterface $request):?string
    {
        if(!filter_var(env('SPLASH_CAPACITOR_CORS',false),FILTER_VALIDATE_BOOLEAN))return null;
        $origin=(string)$request->getHeaderLine('Origin');
        return in_array($origin,['https://localhost','capacitor://localhost'],true)?$origin:null;
    }
    private function headers(ResponseInterface $response,string $origin):ResponseInterface
    {
        return $response->setHeader('Access-Control-Allow-Origin',$origin)
            ->setHeader('Access-Control-Allow-Credentials','true')
            ->setHeader('Access-Control-Allow-Headers','Accept, Content-Type, X-CSRF-TOKEN')
            ->setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS')
            ->setHeader('Access-Control-Max-Age','600')
            ->setHeader('Vary','Origin');
    }
    public function before(RequestInterface $request,$arguments=null)
    {
        $origin=$this->allowed($request);
        if($origin && strtoupper($request->getMethod())==='OPTIONS'){
            return $this->headers(service('response')->setStatusCode(204),$origin);
        }
    }
    public function after(RequestInterface $request,ResponseInterface $response,$arguments=null)
    {
        $origin=$this->allowed($request);
        if($origin)$this->headers($response,$origin);
    }
}
