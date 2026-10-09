<?php

namespace App\Controllers;

use CodeIgniter\HTTP\RedirectResponse;

class Home extends BaseController
{
    public function index(): RedirectResponse|string
    {
        // Após o login tradicional ou o link do Shield, retornar à mesma SPA no ambiente local.
        if (ENVIRONMENT === 'development') {
            $frontend = trim((string) env('SPLASH_FRONTEND_URL', 'http://localhost:5173/'));
            if (filter_var($frontend, FILTER_VALIDATE_URL)
                && in_array(parse_url($frontend, PHP_URL_SCHEME), ['http', 'https'], true)) {
                return redirect()->to($frontend);
            }
        }

        // Na hospedagem, o frontend compilado terá seu próprio ponto de entrada.
        return view('welcome_message');
    }
}
