<?php

declare(strict_types=1);

if (! function_exists('splash_frontend_url')) {
    /**
     * Origem da interface SPLASH. Configurável em SPLASH_FRONTEND_URL no .env.
     */
    function splash_frontend_url(): string
    {
        $fallback = ENVIRONMENT === 'development' ? 'http://localhost:5173/' : base_url('/');
        $url = trim((string) env('SPLASH_FRONTEND_URL', $fallback));

        if (! filter_var($url, FILTER_VALIDATE_URL)
            || ! in_array(parse_url($url, PHP_URL_SCHEME), ['http', 'https'], true)) {
            return $fallback;
        }

        return $url;
    }
}
