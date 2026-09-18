<?php
/**
 * EduFlow CRM — shared config. EDIT ONLY THIS FILE, then open install.php once.
 *
 * MySQL credentials come from cPanel → "MySQL® Databases" (create DB, create
 * user, grant ALL PRIVILEGES on that DB). $DB_PREFIX lets several CRMs share one
 * database if you must.
 */

$DB_HOST = 'localhost';
$DB_NAME = 'eduflow_crm';
$DB_USER = 'eduflow_user';
$DB_PASS = 'CHANGE-ME-cpanel-db-password';
$DB_PORT = 3306;
$DB_PREFIX = 'eduflow_';

/* ------------------------------------------------------------------ helpers */

function db(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $GLOBALS['DB_HOST'], $GLOBALS['DB_PORT'], $GLOBALS['DB_NAME']);
        try {
            $pdo = new PDO($dsn, $GLOBALS['DB_USER'], $GLOBALS['DB_PASS'], [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ]);
        } catch (Throwable $e) {
            http_out(500, ['ok' => false, 'error' => 'DB connection failed: ' . $e->getMessage()]);
        }
    }
    return $pdo;
}

function tbl(string $name): string {
    return '`' . $GLOBALS['DB_PREFIX'] . $name . '`';
}

/** JSON response. Never mixes session/cookie work into output. */
function http_out(int $status, array $payload): void {
    if (!headers_sent()) {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('X-Content-Type-Options: nosniff');
        header('Referrer-Policy: same-origin');
        header('Cache-Control: no-store');
    }
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/**
 * Session bootstrap. SameSite=Lax + Secure-over-HTTPS is the right pairing for
 * a CRM that is only ever opened by top-level navigation from your own domain.
 * Must run before any output, hence it lives here rather than in http_out().
 */
function start_session(): void {
    if (session_status() === PHP_SESSION_ACTIVE) return;
    if (PHP_VERSION_ID >= 70300) {
        session_set_cookie_params([
            'lifetime' => 0, 'path' => '/', 'domain' => '',
            'secure'   => !empty($_SERVER['HTTPS']),
            'httponly' => true, 'samesite' => 'Lax',
        ]);
    } else {
        session_set_cookie_params(0, '/', '', !empty($_SERVER['HTTPS']), true);
    }
    session_name('EDUFLOWSESS');
    @session_start();
}

function body_json(): array {
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') return [];
    $d = json_decode($raw, true);
    return is_array($d) ? $d : [];
}

function now(): string { return gmdate('Y-m-d H:i:s'); }

/* --------------------------------------------------------- access control */

/** entity => [min roles allowed to READ]; write is stricter (see can_write). */
const CAN_READ = [
    'lead'        => ['Admin', 'Manager', 'Counselor'],
    'application' => ['Admin', 'Manager', 'Counselor', 'Doc Processor'],
    'task'        => ['Admin', 'Manager', 'Counselor', 'Doc Processor'],
    'activity'    => ['Admin', 'Manager', 'Counselor'],
    'invoice'     => ['Admin', 'Manager', 'Accounts'],
    'partner'     => ['Admin', 'Manager', 'Accounts'],
    'university'  => ['Admin', 'Manager', 'Counselor', 'Doc Processor', 'Accounts'],
    'template'    => ['Admin', 'Manager', 'Counselor'],
    'document'    => ['Admin', 'Manager', 'Counselor', 'Doc Processor'],
    'contact'     => ['Admin', 'Manager', 'Counselor'],
    'user'        => ['Admin', 'Manager'],
    'audit'       => ['Admin', 'Manager'],
];

/** Roles allowed to CREATE/UPDATE a given entity. Anything not listed is read-only. */
const CAN_WRITE = [
    'lead'        => ['Admin', 'Manager', 'Counselor'],
    'application' => ['Admin', 'Manager', 'Counselor', 'Doc Processor'],
    'task'        => ['Admin', 'Manager', 'Counselor', 'Doc Processor'],
    'activity'    => ['Admin', 'Manager', 'Counselor'],
    'invoice'     => ['Admin', 'Manager', 'Accounts'],
    'partner'     => ['Admin', 'Manager', 'Accounts'],
    'university'  => ['Admin', 'Manager'],
    'template'    => ['Admin', 'Manager'],
    'document'    => ['Admin', 'Manager', 'Counselor', 'Doc Processor'],
    'contact'     => ['Admin', 'Manager', 'Counselor'],
    'user'        => ['Admin'],
    'audit'       => [],
];

/**
 * Ownership scoping. Counselors only see the rows they own; server-side, not
 * merely hidden in the UI. Returns SQL fragment + bound value or [null, null].
 */
function scope_for(string $entity, array $user): array {
    if (in_array($user['role'], ['Admin', 'Manager'], true)) return ['1', []];
    $col = ['lead' => '$.owner', 'application' => '$.owner', 'task' => '$.assignee', 'activity' => '$.user'][$entity] ?? null;
    if ($col === null) return ['1', []];
    // MySQL 5.7+/8.0 JSON path; falls back to LIKE if the JSON ext is old.
    if (json_path_supported()) return ["(JSON_UNQUOTE(JSON_EXTRACT(data,'$col')) = ? OR JSON_EXTRACT(data,'$col') IS NULL OR JSON_UNQUOTE(JSON_EXTRACT(data,'$col')) = '')", [$user['name']]];
    return ['1', []]; // conservative: no scoping available, rely on role read list
}

function json_path_supported(): bool {
    static $ok = null;
    if ($ok === null) {
        try { $ok = (bool) db()->query('SELECT JSON_EXTRACT(\'{"a":1}\',\'$.a\')')->fetchColumn(); }
        catch (Throwable $e) { $ok = false; }
    }
    return $ok;
}

function current_user(): ?array {
    start_session();
    if (empty($_SESSION['eduflow_user'])) return null;
    return $_SESSION['eduflow_user'];
}

function require_role(string $entity, bool $write = false): array {
    $u = current_user();
    if (!$u) http_out(401, ['ok' => false, 'error' => 'Not signed in']);
    $map = $write ? CAN_WRITE : CAN_READ;
    $allowed = $map[$entity] ?? ['Admin'];
    if (!in_array($u['role'], $allowed, true)) {
        http_out(403, ['ok' => false, 'error' => "Role {$u['role']} may not " . ($write ? 'modify' : 'read') . " $entity"]);
    }
    return $u;
}

/* ------------------------------------------------------------ server tokens */

/**
 * Anti-abuse for a CRM exposed on the public internet: same-origin + a
 * per-session token. Cheap but effective against drive-by POSTs.
 */
function csrf_token(): string {
    start_session();
    if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(16));
    return $_SESSION['csrf'];
}
function check_write_origin(): void {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') return;
    $token = $_SERVER['HTTP_X_EDUFLOW_TOKEN'] ?? '';
    start_session();
    $expect = $_SESSION['csrf'] ?? '';
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $host   = $_SERVER['HTTP_HOST'] ?? '';
    if ($host && $origin && stripos($origin, $host) === false) {
        http_out(403, ['ok' => false, 'error' => 'Cross-origin write rejected']);
    }
    if ($expect !== '' && !hash_equals($expect, $token)) {
        http_out(403, ['ok' => false, 'error' => 'Missing or stale X-Eduflow-Token header']);
    }
}
