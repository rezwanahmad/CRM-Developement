<?php
/**
 * EduFlow CRM — the whole server. ~250 lines, no framework, no Composer.
 *
 *   GET  ?action=hello          → capability probe (no auth)
 *   POST ?action=login          → {username,pass} → session + csrf token
 *   POST ?action=logout
 *   GET  ?action=me             → current user (or 401)
 *   GET  ?action=sync&rev=N     → {unchanged:true} | full state filtered by role
 *   POST ?action=push           → [{op,entity,id,data}] queue drain
 *   GET  ?action=audit          → recent server-side audit rows
 *
 * Storage model: one `records` table, one JSON document per CRM record, plus a
 * global revision counter. Clients pull the full state when their rev is stale.
 * At consultancy scale (tens of users, tens of thousands of records) this beats
 * a half-finished field-mapping layer and keeps zero schema migrations.
 */
require __DIR__ . '/config.php';

$action = $_GET['action'] ?? 'hello';
$IN = body_json();

/** entity (JS key) => table the client store uses */
const TABLE_OF = [
    'lead' => 'leads', 'application' => 'applications', 'task' => 'tasks',
    'activity' => 'activities', 'invoice' => 'invoices', 'document' => 'documents',
    'university' => 'universities', 'partner' => 'partners', 'template' => 'templates',
    'contact' => 'contacts', 'user' => 'users',
];

switch ($action) {

/* ------------------------------------------------------------------ hello */
case 'hello':
    $rev = 0;
    try {
        $rev = (int) db()->query('SELECT v FROM ' . tbl('meta') . " WHERE k='rev'")->fetchColumn();
    } catch (Throwable $e) {
        http_out(200, ['ok' => false, 'installed' => false, 'error' => $e->getMessage()]);
    }
    http_out(200, [
        'ok' => true, 'installed' => $rev > 0, 'rev' => $rev,
        'php' => PHP_VERSION, 'csrf' => csrf_token(),
        'now' => now(), 'server_tz' => date_default_timezone_get(),
    ]);
    break;

/* ------------------------------------------------------------------ login */
case 'login':
    start_session();
    $u = trim((string) ($IN['username'] ?? ''));
    $p = (string) ($IN['pass'] ?? '');
    if ($u === '' || $p === '') http_out(400, ['ok' => false, 'error' => 'username and pass required']);

    $row = null;
    try {
        $st = db()->prepare('SELECT * FROM ' . tbl('users') . ' WHERE username = ? LIMIT 1');
        $st->execute([$u]); $row = $st->fetch();
    } catch (Throwable $e) {
        http_out(500, ['ok' => false, 'error' => 'users table missing — run api/install.php first']);
    }

    // Brute-force brake: 6 bad tries in 10 minutes locks that username.
    if ($row && (int) $row['fail_count'] >= 6 && $row['fail_at'] && (time() - strtotime($row['fail_at'] . ' UTC')) < 600) {
        audit_write('locked', 'user', $u, '');
        http_out(429, ['ok' => false, 'error' => 'Too many failed attempts — wait 10 minutes.']);
    }
    if (!$row || (int) $row['active'] !== 1 || !password_verify($p, $row['pass'])) {
        if ($row) {
            db()->prepare('UPDATE ' . tbl('users') . ' SET fail_count = fail_count + 1, fail_at = ? WHERE username = ?')
                ->execute([now(), $u]);
        }
        audit_write('login_failed', 'user', $u, '');
        http_out(401, ['ok' => false, 'error' => 'Wrong username or password.']);
    }

    $pdo = db();
    $pdo->prepare('UPDATE ' . tbl('users') . ' SET fail_count = 0, fail_at = NULL WHERE username = ?')->execute([$u]);
    if (password_needs_rehash($row['pass'], PASSWORD_DEFAULT)) {
        $pdo->prepare('UPDATE ' . tbl('users') . ' SET pass = ? WHERE username = ?')->execute([password_hash($p, PASSWORD_DEFAULT), $u]);
    }
    session_regenerate_id(true);
    $_SESSION['eduflow_user'] = [
        'username' => $row['username'], 'name' => $row['name'], 'role' => $row['role'],
        'branch' => $row['branch'], 'phone' => $row['phone'], 'email' => $row['email'],
    ];
    audit_write('login', 'user', $u, '');
    http_out(200, ['ok' => true, 'user' => $_SESSION['eduflow_user'], 'csrf' => csrf_token(), 'rev' => current_rev()]);
    break;

case 'logout':
    start_session();
    $who = $_SESSION['eduflow_user']['username'] ?? 'unknown';
    $_SESSION = [];
    @session_destroy();
    audit_write('logout', 'user', $who, '');
    http_out(200, ['ok' => true]);
    break;

case 'me':
    $u = current_user();
    if (!$u) http_out(401, ['ok' => false, 'error' => 'signed out']);
    http_out(200, ['ok' => true, 'user' => $u, 'csrf' => csrf_token(), 'rev' => current_rev(),
        'roles' => ['read' => array_keys(CAN_READ), 'can_admin' => in_array($u['role'], ['Admin', 'Manager'], true)]]);
    break;

/* ------------------------------------------------------------------- sync */
case 'sync':
    $user = require_role('lead', false); // any signed-in user qualifies; per-entity filtering below
    $clientRev = isset($_GET['rev']) ? (int) $_GET['rev'] : -1;
    $rev = current_rev();
    if ($clientRev === $rev) http_out(200, ['ok' => true, 'unchanged' => true, 'rev' => $rev]);

    $out = []; $counts = [];
    foreach (TABLE_OF as $entity => $table) {
        if (!in_array($user['role'], CAN_READ[$entity] ?? ['Admin'], true)) continue;
        [$cond, $args] = scope_for($entity, $user);
        $sql = 'SELECT rid, data FROM ' . tbl('records') . " WHERE entity = ? AND deleted = 0 AND ($cond)";
        $st = db()->prepare($sql); $st->execute(array_merge([$entity], $args));
        $rows = [];
        foreach ($st->fetchAll() as $r) {
            $d = json_decode($r['data'], true);
            if (!is_array($d)) continue;
            $d['id'] = $r['rid'];
            $rows[] = $d;
        }
        $out[$table] = $rows; $counts[$entity] = count($rows);
    }
    // Team list for pickers, password-free.
    if (in_array($user['role'], CAN_READ['user'], true)) {
        $out['users'] = db()->query('SELECT username,name,role,branch,phone,email,active FROM ' . tbl('users') . ' ORDER BY name')->fetchAll();
        foreach ($out['users'] as &$uu) { $uu['id'] = $uu['name']; $uu['active'] = (int) $uu['active'] === 1; }
    } else {
        $out['users'] = [['id' => $user['name'], 'name' => $user['name'], 'role' => $user['role'], 'username' => $user['username'], 'active' => true]];
    }
    http_out(200, ['ok' => true, 'rev' => $rev, 'data' => $out, 'counts' => $counts, 'role' => $user['role']]);
    break;

/* ------------------------------------------------------------------- push */
case 'push':
    check_write_origin();
    $user = require_role('lead', true);
    $ops = $IN['ops'] ?? $IN;
    if (!is_array($ops) || !isset($ops[0])) http_out(200, ['ok' => true, 'applied' => 0, 'note' => 'empty queue']);

    $pdo = db();
    $applied = 0; $skipped = []; $touched = [];
    $upsert = $pdo->prepare('INSERT INTO ' . tbl('records') . ' (entity,rid,data,updated,updated_by,deleted,rev) VALUES (?,?,?,?,?,?,?)
                             ON DUPLICATE KEY UPDATE data=VALUES(data), updated=VALUES(updated), updated_by=VALUES(updated_by), deleted=VALUES(deleted), rev=VALUES(rev)');
    $audit = $pdo->prepare('INSERT INTO ' . tbl('audit') . ' (at,actor,action,entity,rid,fields,ip) VALUES (?,?,?,?,?,?,?)');
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';

    foreach ($ops as $op) {
        $entity = (string) ($op['entity'] ?? '');
        $rid    = (string) ($op['id'] ?? '');
        $mode   = (string) ($op['op'] ?? 'update');
        $data   = $op['data'] ?? null;
        if (!isset(TABLE_OF[$entity]) || $rid === '') { $skipped[] = 'bad target'; continue; }
        if ($entity === 'user') { $skipped[] = 'users are managed in the DB by an admin'; continue; }
        if (!in_array($user['role'], CAN_WRITE[$entity] ?? [], true)) { $skipped[] = "$entity:$mode not permitted"; continue; }
        if (!is_array($data)) { $skipped[] = "$entity:$rid no payload"; continue; }

        // Ownership guard: a counselor may only touch rows already assigned to
        // them, and cannot silently reassign a record out of another user's book.
        $st = $pdo->prepare('SELECT data FROM ' . tbl('records') . ' WHERE entity = ? AND rid = ? LIMIT 1');
        $st->execute([$entity, $rid]); $prev = $st->fetchColumn();
        $prevArr = $prev ? json_decode($prev, true) : null;
        if (!in_array($user['role'], ['Admin', 'Manager'], true) && $prevArr) {
            $fk = ['lead' => 'owner', 'application' => 'owner', 'task' => 'assignee', 'activity' => 'user'][$entity] ?? null;
            if ($fk && isset($prevArr[$fk]) && $prevArr[$fk] !== '' && $prevArr[$fk] !== $user['name']) {
                $skipped[] = "$entity:$rid owned by {$prevArr[$fk]}";
                continue;
            }
        }
        // Server owns _rev, updated, updated_by. Never trust the client stamp.
        $data['id'] = $rid;
        $data['updated_by'] = $user['name'];
        unset($data['_rev']);
        $deleted = $mode === 'delete' ? 1 : (int) !empty($data['_deleted']);
        $rev = current_rev() + 1;
        $upsert->execute([$entity, $rid, json_encode($data, JSON_UNESCAPED_UNICODE), now(), $user['name'], $deleted, $rev]);
        $audit->execute([now(), $user['name'], $mode === 'delete' ? 'delete' : ($mode === 'create' ? 'create' : 'update'),
                         $entity, $rid, implode(',', array_keys(array_diff_key($data, ['id' => 1]))), $ip]);
        $touched[$entity] = ($touched[$entity] ?? 0) + 1;
        $applied++;
    }
    bump_rev();
    http_out(200, ['ok' => true, 'applied' => $applied, 'skipped' => $skipped, 'touched' => $touched, 'rev' => current_rev()]);
    break;

case 'audit':
    $user = current_user();
    if (!$user) http_out(401, ['ok' => false, 'error' => 'signed out']);
    if (!in_array($user['role'], CAN_READ['audit'], true)) http_out(403, ['ok' => false, 'error' => 'admins only']);
    $rows = db()->query('SELECT at,actor,action,entity,rid,fields FROM ' . tbl('audit') . ' ORDER BY id DESC LIMIT 250')->fetchAll();
    http_out(200, ['ok' => true, 'rows' => $rows]);
    break;

default:
    http_out(404, ['ok' => false, 'error' => 'Unknown action: ' . $action]);
}

/* ---------------------------------------------------------------- helpers */
function current_rev(): int {
    try { return (int) db()->query('SELECT v FROM ' . tbl('meta') . " WHERE k='rev'")->fetchColumn(); }
    catch (Throwable $e) { return 0; }
}
function bump_rev(): void {
    $next = current_rev() + 1;
    db()->prepare('REPLACE INTO ' . tbl('meta') . ' (k,v) VALUES (?,?)')->execute(['rev', (string) $next]);
}
function audit_write(string $action, string $entity, string $rid, string $fields): void {
    try {
        db()->prepare('INSERT INTO ' . tbl('audit') . ' (at,actor,action,entity,rid,fields,ip) VALUES (?,?,?,?,?,?,?)')
            ->execute([now(), current_user()['username'] ?? 'anonymous', $action, $entity, $rid, $fields, $_SERVER['REMOTE_ADDR'] ?? '']);
    } catch (Throwable $e) { /* never let auditing break a request */ }
}
