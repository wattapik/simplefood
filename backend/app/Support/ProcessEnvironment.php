<?php

namespace App\Support;

/**
 * Shared PATH/uvx resolution for anything that shells out to a Node bridge script
 * that itself spawns `uvx` (cronometer-api-mcp) — used by both CronometerService
 * and ChatAgentService, which otherwise had identical copies of this logic.
 */
class ProcessEnvironment
{
    public static function pathWithLocalBin(): string
    {
        $path = getenv('PATH') ?: '';
        $home = self::realHomeDirectory();

        return implode(':', array_filter([$path, $home !== '' ? "{$home}/.local/bin" : null, '/usr/local/bin']));
    }

    /**
     * Find uvx by absolute path rather than trusting this process's inherited PATH,
     * which for a long-running `php artisan serve` (or php-fpm) can go stale relative
     * to what a shell would resolve (e.g. after `uv` is installed post-launch). Falls
     * back to the bare command name so a PATH lookup is still attempted as a last resort.
     */
    public static function resolveUvxPath(): string
    {
        if ($override = config('services.cronometer.uvx_path')) {
            return $override;
        }

        $home = self::realHomeDirectory();

        $candidates = array_filter([
            $home !== '' ? "{$home}/.local/bin/uvx" : null,
            '/usr/local/bin/uvx',
            '/usr/bin/uvx',
        ]);

        foreach ($candidates as $candidate) {
            if (is_executable($candidate)) {
                return $candidate;
            }
        }

        return 'uvx';
    }

    /**
     * The invoking OS user's real home directory — where things are actually
     * *installed* (e.g. `uv` puts `uvx` at `~/.local/bin/uvx` when installed for a
     * regular user, as it is in local dev). `getenv('HOME')` is empty for some
     * long-running server processes (observed with `php artisan serve` depending on
     * how it was launched), which silently breaks both lookups above — so this falls
     * back to the passwd database entry for the current user, which doesn't depend on
     * the environment at all.
     */
    public static function realHomeDirectory(): string
    {
        if ($home = getenv('HOME')) {
            return $home;
        }

        if (function_exists('posix_getpwuid') && function_exists('posix_getuid')) {
            $entry = posix_getpwuid(posix_getuid());

            if (is_array($entry) && ! empty($entry['dir'])) {
                return $entry['dir'];
            }
        }

        return '';
    }

    /**
     * A writable "home" for the child process's own HOME env var — deliberately
     * *not* realHomeDirectory() above, which is about where things are installed,
     * not where a process is allowed to write. In the Docker deployment, php-fpm
     * runs as www-data, whose passwd home is `/var/www`, which the image never makes
     * writable — `uv` fails outright trying to create its cache dir there
     * ("Permission denied", closing the MCP connection immediately). Laravel's
     * storage/ path is guaranteed to exist and be writable in every environment (the
     * framework requires it, and the Docker entrypoint chowns it to www-data on every
     * boot), so a dedicated directory under it is used instead, sidestepping
     * OS-user-home assumptions entirely. Falls back to realHomeDirectory() only if
     * that's somehow not writable either.
     */
    public static function writableHomeDirectory(): string
    {
        if (function_exists('storage_path')) {
            $home = storage_path('uv-home');

            if (! is_dir($home)) {
                @mkdir($home, 0755, true);
            }

            if (is_dir($home) && is_writable($home)) {
                return $home;
            }
        }

        return self::realHomeDirectory();
    }
}
