<?php
/**
 * EduFlow CRM — one-time installer.
 *
 * 1. Upload the whole project (public_html/ contents) to your host.
 * 2. Create a MySQL DB + user in cPanel and paste the credentials into config.php.
 * 3. Open  https://yourdomain.com/api/install.php  in a browser, set an admin
 *    password, click Install.
 * 4. DELETE THIS FILE afterwards. It refuses to run twice unless forced, but
 *    leaving installers on a live host is bad practice.
 */
require __DIR__ . '/config.php';
header('Content-Type: text/html; charset=utf-8');

$done = false; $errors = []; $notes = [];
$tablesExist = false;
try {
    $st = db()->query("SHOW TABLES LIKE '" . $GLOBALS['DB_PREFIX'] . "%'");
    $existing = $st->fetchAll(PDO::FETCH_COLUMN);
    $tablesExist = count($existing) > 0;
} catch (Throwable $e) {
    $errors[] = 'Cannot reach MySQL: ' . $e->getMessage() . ' — check config.php credentials.';
}

$seedFile = dirname(__DIR__) . '/data/seed.json';
$seed = is_readable($seedFile) ? json_decode(file_get_contents($seedFile), true) : null;
if (!$seed) $errors[] = 'data/seed.json is missing or unreadable — run `node scripts/build-seed.mjs` before uploading, or install with --no-demo.';

$hasUsers = false;
if ($tablesExist) {
    try { $hasUsers = (int) db()->query('SELECT COUNT(*) FROM ' . tbl('users'))->fetchColumn() > 0; } catch (Throwable $e) {}
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $adminUser = trim($_POST['admin_user'] ?? 'admin');
    $adminPass = (string) ($_POST['admin_pass'] ?? '');
    $adminName = trim($_POST['admin_name'] ?? 'Administrator');
    $withDemo  = !empty($_POST['with_demo']);
    $force     = !empty($_POST['force']);

    if ($tablesExist && $hasUsers && !$force) {
        $errors[] = 'This database already has users. Tick "overwrite" only if you mean it — that destroys data.';
    } elseif (strlen($adminPass) < 10) {
        $errors[] = 'Admin password must be at least 10 characters.';
    } else {
        try {
            $pdo = db();
            $pdo->exec('SET NAMES utf8mb4');
            $pdo->exec('SET sql_mode="STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION"');

            $pdo->exec('CREATE TABLE IF NOT EXISTS ' . tbl('records') . " (
                entity  VARCHAR(32)  NOT NULL,
                rid     VARCHAR(64)  NOT NULL,
                data    JSON         NOT NULL,
                updated DATETIME(3)  NOT NULL,
                updated_by VARCHAR(64) NOT NULL DEFAULT '',
                deleted TINYINT(1)   NOT NULL DEFAULT 0,
                rev     BIGINT       NOT NULL DEFAULT 0,
                PRIMARY KEY (entity, rid),
                KEY idx_updated (updated),
                KEY idx_entity_rev (entity, rev)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

            $pdo->exec('CREATE TABLE IF NOT EXISTS ' . tbl('users') . " (
                username VARCHAR(64) PRIMARY KEY,
                pass     VARCHAR(255) NOT NULL,
                name     VARCHAR(128) NOT NULL,
                role     VARCHAR(32)  NOT NULL DEFAULT 'Counselor',
                branch   VARCHAR(64)  NOT NULL DEFAULT '',
                phone    VARCHAR(32)  NOT NULL DEFAULT '',
                email    VARCHAR(128) NOT NULL DEFAULT '',
                active   TINYINT(1)   NOT NULL DEFAULT 1,
                fail_count INT NOT NULL DEFAULT 0,
                fail_at  DATETIME NULL,
                updated  DATETIME(3) NOT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

            $pdo->exec('CREATE TABLE IF NOT EXISTS ' . tbl('audit') . " (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                at DATETIME(3) NOT NULL,
                actor VARCHAR(64) NOT NULL,
                action VARCHAR(16) NOT NULL,
                entity VARCHAR(32) NOT NULL,
                rid VARCHAR(64) NOT NULL,
                fields TEXT NULL,
                ip VARCHAR(45) NOT NULL DEFAULT '',
                KEY idx_recent (at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

            $pdo->exec('CREATE TABLE IF NOT EXISTS ' . tbl('meta') . " (
                k VARCHAR(32) PRIMARY KEY, v LONGTEXT NOT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

            $pdo->prepare('REPLACE INTO ' . tbl('users') . ' (username,pass,name,role,active,updated) VALUES (?,?,?,?,1,?)')
                ->execute([$adminUser, password_hash($adminPass, PASSWORD_DEFAULT), $adminName, 'Admin', now()]);
            $notes[] = "Admin user '{$adminUser}' created (bcrypt, cost " . PASSWORD_DEFAULT . ').';

            if ($withDemo && $seed) {
                $pdo->exec('DELETE FROM ' . tbl('records'));
                $ins = $pdo->prepare('INSERT INTO ' . tbl('records') . ' (entity,rid,data,updated,updated_by,rev) VALUES (?,?,?,?,?,1)
                                      ON DUPLICATE KEY UPDATE data=VALUES(data), updated=VALUES(updated), rev=1');
                $map = [
                    'leads' => 'lead', 'applications' => 'application', 'tasks' => 'task',
                    'activities' => 'activity', 'invoices' => 'invoice', 'documents' => 'document',
                    'universities' => 'university', 'partners' => 'partner', 'templates' => 'template',
                    'contacts' => 'contact', 'users' => 'user',
                ];
                $n = 0;
                foreach ($map as $seedKey => $entity) {
                    if ($entity === 'user') continue;      // users live in their own table
                    foreach (($seed[$seedKey] ?? []) as $row) {
                        if (empty($row['id'])) continue;
                        $ins->execute([$entity, (string) $row['id'], json_encode($row, JSON_UNESCAPED_UNICODE), now(), 'install', 1]);
                        $n++;
                    }
                }
                $pdo->prepare('INSERT INTO ' . tbl('users') . ' (username,pass,name,role,branch,phone,email,active,updated) VALUES (?,?,?,?,?,?,?,?,?)
                               ON DUPLICATE KEY UPDATE name=VALUES(name), role=VALUES(role), active=1')
                    ->execute(['sana', password_hash('sana123', PASSWORD_DEFAULT), 'Sana Mehmood', 'Counselor', 'Head Office', '', '', 1, now()]);
                $notes[] = "Imported {$n} demo records from data/seed.json.";
            } else {
                $pdo->exec('DELETE FROM ' . tbl('records'));
                $notes[] = 'Installed empty — no demo records.';
            }
            $pdo->prepare('REPLACE INTO ' . tbl('meta') . ' (k,v) VALUES (?,?)')->execute(['rev', '1']);
            $pdo->prepare('REPLACE INTO ' . tbl('meta') . ' (k,v) VALUES (?,?)')->execute(['installed_at', now()]);
            $done = true;
        } catch (Throwable $e) {
            $errors[] = 'Install failed: ' . $e->getMessage();
        }
    }
}
?><!doctype html>
<html><head><meta charset="utf-8"><title>EduFlow CRM — installer</title>
<style>
 body{font:15px/1.6 system-ui,sans-serif;background:#0b1220;color:#e2e8f0;margin:0;padding:40px 16px}
 .box{max-width:640px;margin:0 auto;background:#fff;color:#0f172a;border-radius:14px;padding:26px}
 h1{margin:0 0 4px;font-size:22px} .k{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;font-weight:700}
 label{display:block;margin:14px 0 4px;font-size:13px;font-weight:600;color:#334155}
 input[type=text],input[type=password]{width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font:inherit}
 button{margin-top:18px;background:#f97316;border:0;color:#fff;padding:11px 18px;border-radius:9px;font:inherit;font-weight:700;cursor:pointer}
 .ok{background:#f0fdf4;border:1px solid #bbf7d0;color:#166534;padding:12px;border-radius:9px;margin-top:16px}
 .err{background:#fef2f2;border:1px solid #fecaca;color:#991b1b;padding:12px;border-radius:9px;margin-top:16px}
 .note{background:#f0f9ff;border:1px solid #bae6fd;color:#075985;padding:10px 12px;border-radius:9px;margin-top:10px;font-size:13px}
 code{background:#f1f5f9;padding:1px 5px;border-radius:4px;font-size:13px}
</style></head><body><div class="box">
<div class="k">EduFlow CRM</div><h1>Shared-hosting installer</h1>
<?php if ($errors): ?><?php foreach ($errors as $e): ?><div class="err"><?= htmlspecialchars($e) ?></div><?php endforeach; endif; ?>
<?php if ($done): ?>
  <div class="ok"><b>Installed.</b> Now: <b>delete <code>api/install.php</code> from the server</b>, then in <code>index.html</code> change
  <code>window.EDUFLOW = { api: "" }</code> to <code>window.EDUFLOW = { api: "api/index.php" }</code>.
  Log in with <code><?= htmlspecialchars($adminUser) ?></code> and your password. Reload, then hit <b>↻ Sync</b> once to pull the seeded DB into this browser.</div>
  <?php foreach ($notes as $n): ?><div class="note"><?= htmlspecialchars($n) ?></div><?php endforeach; ?>
<?php else: ?>
  <?php if ($tablesExist): ?>
    <div class="note">Existing tables detected<?= $hasUsers ? ' with users — installing again will overwrite the demo data unless you tick "overwrite".' : '.' ?></div>
  <?php endif; ?>
  <form method="post">
    <label>Admin username<input type="text" name="admin_user" value="admin" required></label>
    <label>Admin full name<input type="text" name="admin_name" value="Administrator" required></label>
    <label>Admin password (min 10 chars)<input type="password" name="admin_pass" required minlength="10"></label>
    <label style="display:flex;gap:8px;align-items:center;font-weight:500">
      <input type="checkbox" name="with_demo" value="1" checked style="width:auto"> Load the UK/IE/TR/MY demo dataset (uncheck for a clean go-live)</label>
    <?php if ($hasUsers): ?><label style="display:flex;gap:8px;align-items:center;font-weight:500;color:#b91c1c">
      <input type="checkbox" name="force" value="1" style="width:auto"> I understand this overwrites existing records</label><?php endif; ?>
    <button>Install</button>
  </form>
  <div class="note">PHP <?= PHP_VERSION ?> · MySQL via PDO <?= extension_loaded('pdo_mysql') ? '✔' : '✘ (install php-mysqlnd!)' ?></div>
<?php endif; ?>
</div></body></html>
