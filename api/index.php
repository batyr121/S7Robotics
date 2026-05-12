<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

$dataDir = __DIR__ . '/.storage';
if (!is_dir($dataDir)) {
    mkdir($dataDir, 0755, true);
}

$pdo = new PDO('sqlite:' . $dataDir . '/crm.sqlite');
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
$pdo->exec('pragma busy_timeout = 5000');

init_db($pdo);

$input = json_decode(file_get_contents('php://input') ?: '{}', true);
if (!is_array($input)) {
    $input = [];
}

$action = $_GET['action'] ?? $input['action'] ?? 'status';

try {
    match ($action) {
        'status' => respond(['hasUsers' => has_users($pdo)]),
        'login' => login($pdo, $input),
        'register_first_admin' => register_first_admin($pdo, $input),
        'data' => data_response($pdo, require_user($pdo)),
        'logout' => logout($pdo, require_user($pdo)),
        'create_user' => create_user($pdo, require_admin($pdo), $input),
        'create_student' => create_student($pdo, require_admin($pdo), $input),
        'update_student' => update_student($pdo, require_admin($pdo), $input),
        'create_payment' => create_payment($pdo, require_admin($pdo), $input),
        'delete_payment' => delete_payment($pdo, require_admin($pdo), $input),
        'create_expense' => create_expense($pdo, require_admin($pdo), $input),
        'delete_expense' => delete_simple($pdo, require_admin($pdo), $input, 'expenses'),
        'create_attendance' => create_attendance($pdo, require_user($pdo), $input),
        'toggle_attendance' => toggle_attendance($pdo, require_user($pdo), $input),
        'create_feedback' => create_feedback($pdo, require_user($pdo), $input),
        'create_parent_review' => create_parent_review($pdo, require_user($pdo), $input),
        'create_lesson_check' => create_lesson_check($pdo, require_user($pdo), $input),
        'create_task' => create_task($pdo, require_user($pdo), $input),
        'update_task_status' => update_task_status($pdo, require_user($pdo), $input),
        'delete_task' => delete_task($pdo, require_user($pdo), $input),
        'delete_student' => delete_student($pdo, require_admin($pdo), $input),
        'delete_user' => delete_user($pdo, require_admin($pdo), $input),
        'adjust_xp' => adjust_xp($pdo, require_admin($pdo), $input),
        'reset_xp' => reset_xp($pdo, require_admin($pdo), $input),
        'create_schedule' => create_schedule($pdo, require_admin($pdo), $input),
        'delete_schedule' => delete_simple($pdo, require_admin($pdo), $input, 'schedule'),
        'create_trial' => create_trial($pdo, require_admin($pdo), $input),
        'update_trial_status' => update_trial_status($pdo, require_user($pdo), $input),
        'create_salary' => create_salary($pdo, require_admin($pdo), $input),
        'delete_salary' => delete_simple($pdo, require_admin($pdo), $input, 'salaries'),
        'create_method' => create_method($pdo, require_admin($pdo), $input),
        'delete_method' => delete_simple($pdo, require_admin($pdo), $input, 'methods'),
        'create_announcement' => create_announcement($pdo, require_admin($pdo), $input),
        'delete_announcement' => delete_simple($pdo, require_admin($pdo), $input, 'announcements'),
        default => fail('Unknown action', 404),
    };
} catch (Throwable $error) {
    fail($error->getMessage(), 400);
}

function init_db(PDO $pdo): void
{
    $pdo->exec("
        create table if not exists users (
            id integer primary key autoincrement,
            name text not null,
            email text not null unique,
            password_hash text not null,
            role text not null check (role in ('admin', 'mentor', 'parent')),
            groups_json text not null default '[]',
            created_at text not null default current_timestamp
        );
        create table if not exists sessions (
            token text primary key,
            user_id integer not null references users(id) on delete cascade,
            created_at text not null default current_timestamp
        );
        create table if not exists students (
            id integer primary key autoincrement,
            name text not null,
            course text not null,
            group_name text not null,
            parent text not null,
            phone text not null,
            mentor text not null,
            status text not null default 'active',
            lessons_left integer not null default 0,
            progress integer not null default 0,
            next_payment text,
            created_at text not null default current_timestamp
        );
        create table if not exists payments (
            id integer primary key autoincrement,
            student_id integer not null references students(id) on delete cascade,
            plan text not null,
            amount integer not null,
            status text not null,
            date text not null,
            created_at text not null default current_timestamp
        );
        create table if not exists expenses (
            id integer primary key autoincrement,
            title text not null,
            amount integer not null,
            category text not null,
            date text not null,
            note text,
            created_by text not null,
            created_at text not null default current_timestamp
        );
        create table if not exists attendance (
            id integer primary key autoincrement,
            student_id integer not null references students(id) on delete cascade,
            date text not null,
            status text not null,
            topic text not null,
            created_by integer references users(id) on delete set null,
            created_at text not null default current_timestamp,
            unique(student_id, date)
        );
        create table if not exists feedback (
            id integer primary key autoincrement,
            student_id integer not null references students(id) on delete cascade,
            mentor text not null,
            skill text not null,
            text text not null,
            date text not null,
            created_by integer references users(id) on delete set null,
            created_at text not null default current_timestamp
        );
        create table if not exists schedule (
            id integer primary key autoincrement,
            day text not null,
            group_name text not null,
            time text not null,
            mentor text not null,
            created_at text not null default current_timestamp
        );
        create table if not exists trial_lessons (
            id integer primary key autoincrement,
            child_name text not null,
            parent_name text not null,
            phone text not null,
            program text not null check (program in ('A', 'B')),
            group_name text not null,
            day text not null,
            time text not null,
            date text not null,
            mentor text not null,
            status text not null default 'scheduled',
            note text,
            created_by text not null,
            created_at text not null default current_timestamp
        );
        create table if not exists lesson_checks (
            id integer primary key autoincrement,
            mentor text not null,
            group_name text not null,
            date text not null,
            score integer not null,
            comment text,
            created_by integer references users(id) on delete set null,
            created_at text not null default current_timestamp
        );
        create table if not exists tasks (
            id integer primary key autoincrement,
            title text not null,
            description text,
            assignee text not null,
            priority text not null default 'soon',
            status text not null default 'todo',
            due_date text,
            created_by text not null,
            created_at text not null default current_timestamp
        );
        create table if not exists xp_adjustments (
            id integer primary key autoincrement,
            mentor text not null,
            amount integer not null,
            reason text not null,
            date text not null,
            created_by text not null,
            created_at text not null default current_timestamp
        );
        create table if not exists salaries (
            id integer primary key autoincrement,
            mentor text not null,
            period text not null,
            amount integer not null,
            pay_date text,
            status text not null default 'pending',
            note text,
            created_at text not null default current_timestamp
        );
        create table if not exists methods (
            id integer primary key autoincrement,
            topic text not null,
            group_name text not null,
            mentor text,
            lesson_date text,
            link text,
            file_url text,
            description text,
            created_at text not null default current_timestamp
        );
        create table if not exists parent_reviews (
            id integer primary key autoincrement,
            student_id integer not null references students(id) on delete cascade,
            parent_id integer not null references users(id) on delete cascade,
            attendance_id integer references attendance(id) on delete set null,
            mentor text not null,
            rating integer not null,
            text text not null,
            bonus_points integer not null default 0,
            date text not null,
            created_at text not null default current_timestamp
        );
        create table if not exists announcements (
            id integer primary key autoincrement,
            title text not null,
            kind text not null default 'news',
            text text not null,
            expires_at text,
            created_at text not null default current_timestamp
        );
    ");
    migrate_users_role_check($pdo);
}

function migrate_users_role_check(PDO $pdo): void
{
    $stmt = $pdo->prepare("select sql from sqlite_master where type = 'table' and name = 'users'");
    $stmt->execute();
    $sql = (string)$stmt->fetchColumn();
    $stmt->closeCursor();
    if (str_contains($sql, "'parent'")) {
        return;
    }
    $pdo->exec('pragma foreign_keys = off');
    $pdo->exec("
        drop table if exists users_new;
        create table users_new (
            id integer primary key autoincrement,
            name text not null,
            email text not null unique,
            password_hash text not null,
            role text not null check (role in ('admin', 'mentor', 'parent')),
            groups_json text not null default '[]',
            created_at text not null default current_timestamp
        );
        insert into users_new (id, name, email, password_hash, role, groups_json, created_at)
            select id, name, email, password_hash, role, groups_json, created_at from users;
        drop table users;
        alter table users_new rename to users;
    ");
    $pdo->exec('pragma foreign_keys = on');
}

function login(PDO $pdo, array $input): void
{
    $email = strtolower(trim((string)($input['email'] ?? '')));
    $password = (string)($input['password'] ?? '');
    $stmt = $pdo->prepare('select * from users where lower(email) = ?');
    $stmt->execute([$email]);
    $user = $stmt->fetch();
    if (!$user || !password_verify($password, $user['password_hash'])) {
        fail('Неверный email или пароль.', 401);
    }
    $token = create_session($pdo, (int)$user['id']);
    respond(['token' => $token, 'user' => public_user($user), 'state' => state_for_user($pdo, $user)]);
}

function register_first_admin(PDO $pdo, array $input): void
{
    if (has_users($pdo)) {
        fail('Публичная регистрация закрыта. Аккаунты создает администратор.', 403);
    }
    $userId = insert_user($pdo, [
        'name' => required($input, 'name'),
        'email' => required($input, 'email'),
        'password' => required($input, 'password'),
        'role' => 'admin',
        'groups' => [],
    ]);
    $user = get_user_by_id($pdo, $userId);
    $token = create_session($pdo, $userId);
    respond(['token' => $token, 'user' => public_user($user), 'state' => state_for_user($pdo, $user)]);
}

function create_user(PDO $pdo, array $admin, array $input): void
{
    $role = in_array(($input['role'] ?? 'mentor'), ['admin', 'mentor', 'parent'], true) ? $input['role'] : 'mentor';
    insert_user($pdo, [
        'name' => required($input, 'name'),
        'email' => required($input, 'email'),
        'password' => required($input, 'password'),
        'role' => $role,
        'groups' => $role === 'admin' ? [] : ($role === 'parent' ? normalize_groups($input['childIds'] ?? $input['groups'] ?? []) : normalize_groups($input['groups'] ?? [])),
    ]);
    data_response($pdo, $admin);
}

function create_student(PDO $pdo, array $admin, array $input): void
{
    $paymentDate = $input['paymentDate'] ?? $input['nextPayment'] ?? date('Y-m-d');
    $stmt = $pdo->prepare('
        insert into students (name, course, group_name, parent, phone, mentor, status, lessons_left, progress, next_payment)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ');
    $stmt->execute([
        required($input, 'name'),
        required($input, 'course'),
        required($input, 'group'),
        required($input, 'parent'),
        required($input, 'phone'),
        required($input, 'mentor'),
        $input['status'] ?? 'active',
        8,
        (int)($input['progress'] ?? 10),
        $paymentDate,
    ]);
    $studentId = (int)$pdo->lastInsertId();
    $stmt = $pdo->prepare('insert into payments (student_id, plan, amount, status, date) values (?, ?, ?, ?, ?)');
    $stmt->execute([$studentId, '8 занятий', (int)($input['amount'] ?? 0), 'paid', $paymentDate]);
    data_response($pdo, $admin);
}

function update_student(PDO $pdo, array $admin, array $input): void
{
    $studentId = (int)required($input, 'id');
    $paymentDate = $input['paymentDate'] ?? $input['nextPayment'] ?? date('Y-m-d');
    $stmt = $pdo->prepare('
        update students
        set name = ?, course = ?, group_name = ?, parent = ?, phone = ?, mentor = ?, status = ?, progress = ?, next_payment = ?
        where id = ?
    ');
    $stmt->execute([
        required($input, 'name'),
        required($input, 'course'),
        required($input, 'group'),
        required($input, 'parent'),
        required($input, 'phone'),
        required($input, 'mentor'),
        $input['status'] ?? 'active',
        (int)($input['progress'] ?? 10),
        $paymentDate,
        $studentId,
    ]);
    if ($stmt->rowCount() === 0) {
        $check = $pdo->prepare('select id from students where id = ?');
        $check->execute([$studentId]);
        if (!$check->fetchColumn()) fail('Ученик не найден.', 404);
    }
    recalc_student_subscription($pdo, $studentId);
    data_response($pdo, $admin);
}

function create_payment(PDO $pdo, array $admin, array $input): void
{
    $studentId = (int)required($input, 'studentId');
    $date = required($input, 'date');
    $stmt = $pdo->prepare('insert into payments (student_id, plan, amount, status, date) values (?, ?, ?, ?, ?)');
    $stmt->execute([
        $studentId,
        required($input, 'plan'),
        (int)required($input, 'amount'),
        $input['status'] ?? 'paid',
        $date,
    ]);
    if (($input['status'] ?? 'paid') === 'paid') {
        $stmt = $pdo->prepare('update students set lessons_left = 8, next_payment = ? where id = ?');
        $stmt->execute([$date, $studentId]);
        recalc_student_subscription($pdo, $studentId);
    }
    data_response($pdo, $admin);
}

function delete_payment(PDO $pdo, array $admin, array $input): void
{
    $paymentId = (int)required($input, 'id');
    $stmt = $pdo->prepare('select student_id from payments where id = ?');
    $stmt->execute([$paymentId]);
    $studentId = $stmt->fetchColumn();
    if (!$studentId) fail('Оплата не найдена.', 404);
    $stmt = $pdo->prepare('delete from payments where id = ?');
    $stmt->execute([$paymentId]);
    recalc_student_subscription($pdo, (int)$studentId);
    data_response($pdo, $admin);
}

function create_expense(PDO $pdo, array $admin, array $input): void
{
    $stmt = $pdo->prepare('insert into expenses (title, amount, category, date, note, created_by) values (?, ?, ?, ?, ?, ?)');
    $stmt->execute([
        required($input, 'title'),
        (int)required($input, 'amount'),
        required($input, 'category'),
        required($input, 'date'),
        $input['note'] ?? '',
        $admin['name'],
    ]);
    data_response($pdo, $admin);
}

function create_attendance(PDO $pdo, array $user, array $input): void
{
    if ($user['role'] === 'parent') {
        fail('Родитель не может менять табель.', 403);
    }
    $studentId = (int)required($input, 'studentId');
    assert_student_access($pdo, $user, $studentId);
    $stmt = $pdo->prepare('
        insert into attendance (student_id, date, status, topic, created_by)
        values (?, ?, ?, ?, ?)
        on conflict(student_id, date) do update set status = excluded.status, topic = excluded.topic
    ');
    $stmt->execute([
        $studentId,
        required($input, 'date'),
        $input['status'] ?? 'present',
        required($input, 'topic'),
        (int)$user['id'],
    ]);
    recalc_student_subscription($pdo, $studentId);
    data_response($pdo, $user);
}

function toggle_attendance(PDO $pdo, array $user, array $input): void
{
    if ($user['role'] === 'parent') {
        fail('Родитель не может менять табель.', 403);
    }
    $studentId = (int)required($input, 'studentId');
    $date = required($input, 'date');
    assert_student_access($pdo, $user, $studentId);
    $stmt = $pdo->prepare('select * from attendance where student_id = ? and date = ?');
    $stmt->execute([$studentId, $date]);
    $record = $stmt->fetch();
    if (!$record) {
        $stmt = $pdo->prepare('insert into attendance (student_id, date, status, topic, created_by) values (?, ?, ?, ?, ?)');
        $stmt->execute([$studentId, $date, 'present', 'Быстрая отметка', (int)$user['id']]);
    } elseif ($record['status'] === 'present') {
        $stmt = $pdo->prepare('update attendance set status = ? where id = ?');
        $stmt->execute(['absent', (int)$record['id']]);
    } else {
        $stmt = $pdo->prepare('delete from attendance where id = ?');
        $stmt->execute([(int)$record['id']]);
    }
    recalc_student_subscription($pdo, $studentId);
    data_response($pdo, $user);
}

function recalc_student_subscription(PDO $pdo, int $studentId): void
{
    $stmt = $pdo->prepare('select date from payments where student_id = ? and status = ? order by date desc, id desc limit 1');
    $stmt->execute([$studentId, 'paid']);
    $startDate = $stmt->fetchColumn();
    if (!$startDate) {
        $stmt = $pdo->prepare('select next_payment from students where id = ?');
        $stmt->execute([$studentId]);
        $startDate = $stmt->fetchColumn();
    }

    if ($startDate) {
        $stmt = $pdo->prepare('select count(*) from attendance where student_id = ? and status = ? and date >= ?');
        $stmt->execute([$studentId, 'present', $startDate]);
    } else {
        $stmt = $pdo->prepare('select count(*) from attendance where student_id = ? and status = ?');
        $stmt->execute([$studentId, 'present']);
    }
    $used = min(8, (int)$stmt->fetchColumn());
    $lessonsLeft = max(0, 8 - $used);

    $stmt = $pdo->prepare('update students set lessons_left = ? where id = ?');
    $stmt->execute([$lessonsLeft, $studentId]);
}

function create_feedback(PDO $pdo, array $user, array $input): void
{
    if ($user['role'] === 'parent') {
        fail('Родитель может оставлять отзывы через родительский кабинет.', 403);
    }
    $studentId = (int)required($input, 'studentId');
    assert_student_access($pdo, $user, $studentId);
    $mentor = $user['role'] === 'admin' ? required($input, 'mentor') : $user['name'];
    $stmt = $pdo->prepare('insert into feedback (student_id, mentor, skill, text, date, created_by) values (?, ?, ?, ?, ?, ?)');
    $stmt->execute([
        $studentId,
        $mentor,
        required($input, 'skill'),
        required($input, 'text'),
        required($input, 'date'),
        (int)$user['id'],
    ]);
    data_response($pdo, $user);
}

function create_parent_review(PDO $pdo, array $user, array $input): void
{
    if ($user['role'] !== 'parent' && $user['role'] !== 'admin') {
        fail('Отзывы по урокам доступны родителю или администратору.', 403);
    }
    $studentId = (int)required($input, 'studentId');
    assert_student_access($pdo, $user, $studentId);
    $student = get_student($pdo, $studentId);
    $rating = max(1, min(5, (int)required($input, 'rating')));
    $bonus = max(0, $rating * 10);
    $stmt = $pdo->prepare('
        insert into parent_reviews (student_id, parent_id, attendance_id, mentor, rating, text, bonus_points, date)
        values (?, ?, ?, ?, ?, ?, ?, ?)
    ');
    $stmt->execute([
        $studentId,
        (int)$user['id'],
        isset($input['attendanceId']) && $input['attendanceId'] !== '' ? (int)$input['attendanceId'] : null,
        $student['mentor'],
        $rating,
        required($input, 'text'),
        $bonus,
        $input['date'] ?? date('Y-m-d'),
    ]);
    data_response($pdo, $user);
}

function create_lesson_check(PDO $pdo, array $user, array $input): void
{
    $mentor = $user['role'] === 'admin' ? required($input, 'mentor') : $user['name'];
    $group = required($input, 'group');
    if ($user['role'] !== 'admin' && !in_array($group, user_groups($user), true)) {
        fail('Ментор может проверять только свои группы.', 403);
    }
    $stmt = $pdo->prepare('insert into lesson_checks (mentor, group_name, date, score, comment, created_by) values (?, ?, ?, ?, ?, ?)');
    $stmt->execute([
        $mentor,
        $group,
        required($input, 'date'),
        (int)required($input, 'score'),
        $input['comment'] ?? '',
        (int)$user['id'],
    ]);
    data_response($pdo, $user);
}

function create_task(PDO $pdo, array $user, array $input): void
{
    $assignee = required($input, 'assignee');
    if ($user['role'] !== 'admin' && $assignee !== $user['name']) {
        fail('Ментор может назначать задачи только себе.', 403);
    }
    $stmt = $pdo->prepare('
        insert into tasks (title, description, assignee, priority, status, due_date, created_by)
        values (?, ?, ?, ?, ?, ?, ?)
    ');
    $stmt->execute([
        required($input, 'title'),
        $input['description'] ?? '',
        $assignee,
        $input['priority'] ?? 'soon',
        $input['status'] ?? 'todo',
        $input['dueDate'] ?? '',
        $user['name'],
    ]);
    data_response($pdo, $user);
}

function update_task_status(PDO $pdo, array $user, array $input): void
{
    $taskId = (int)required($input, 'id');
    $status = required($input, 'status');
    if (!in_array($status, ['todo', 'progress', 'done'], true)) {
        fail('Некорректный статус задачи.', 422);
    }
    $stmt = $pdo->prepare('select * from tasks where id = ?');
    $stmt->execute([$taskId]);
    $task = $stmt->fetch();
    if (!$task) fail('Задача не найдена.', 404);
    if ($user['role'] !== 'admin' && $task['assignee'] !== $user['name'] && $task['created_by'] !== $user['name']) {
        fail('Нет доступа к задаче.', 403);
    }
    $stmt = $pdo->prepare('update tasks set status = ? where id = ?');
    $stmt->execute([$status, $taskId]);
    data_response($pdo, $user);
}

function delete_task(PDO $pdo, array $user, array $input): void
{
    $taskId = (int)required($input, 'id');
    $stmt = $pdo->prepare('select * from tasks where id = ?');
    $stmt->execute([$taskId]);
    $task = $stmt->fetch();
    if (!$task) fail('Задача не найдена.', 404);
    if ($user['role'] !== 'admin' && $task['assignee'] !== $user['name'] && $task['created_by'] !== $user['name']) {
        fail('Нет доступа к задаче.', 403);
    }
    $stmt = $pdo->prepare('delete from tasks where id = ?');
    $stmt->execute([$taskId]);
    data_response($pdo, $user);
}

function delete_student(PDO $pdo, array $admin, array $input): void
{
    $studentId = (int)required($input, 'id');
    $stmt = $pdo->prepare('delete from students where id = ?');
    $stmt->execute([$studentId]);
    data_response($pdo, $admin);
}

function delete_user(PDO $pdo, array $admin, array $input): void
{
    $userId = (int)required($input, 'id');
    if ($userId === (int)$admin['id']) {
        fail('Нельзя удалить свой аккаунт.', 422);
    }
    $target = get_user_by_id($pdo, $userId);
    if ($target['role'] === 'admin') {
        $adminCount = (int)$pdo->query("select count(*) from users where role = 'admin'")->fetchColumn();
        if ($adminCount <= 1) {
            fail('Нельзя удалить последнего администратора.', 422);
        }
    }
    $stmt = $pdo->prepare('delete from users where id = ?');
    $stmt->execute([$userId]);
    data_response($pdo, $admin);
}

function adjust_xp(PDO $pdo, array $admin, array $input): void
{
    $stmt = $pdo->prepare('insert into xp_adjustments (mentor, amount, reason, date, created_by) values (?, ?, ?, ?, ?)');
    $stmt->execute([
        required($input, 'mentor'),
        (int)required($input, 'amount'),
        required($input, 'reason'),
        $input['date'] ?? date('Y-m-d'),
        $admin['name'],
    ]);
    data_response($pdo, $admin);
}

function reset_xp(PDO $pdo, array $admin, array $input): void
{
    $mentor = required($input, 'mentor');
    $stmt = $pdo->prepare('select * from users where name = ? limit 1');
    $stmt->execute([$mentor]);
    $mentorUser = $stmt->fetch();
    $groups = $mentorUser ? user_groups($mentorUser) : [];
    if ($groups) {
        $placeholders = implode(',', array_fill(0, count($groups), '?'));
        $stmt = $pdo->prepare("select id from students where group_name in ($placeholders) or mentor = ?");
        $stmt->execute([...$groups, $mentor]);
    } else {
        $stmt = $pdo->prepare('select id from students where mentor = ?');
        $stmt->execute([$mentor]);
    }
    $studentIds = array_map('intval', array_column($stmt->fetchAll(), 'id'));

    $stmt = $pdo->prepare('select coalesce(sum(score), 0) from lesson_checks where mentor = ?');
    $stmt->execute([$mentor]);
    $checksXp = (int)$stmt->fetchColumn();

    if ($studentIds) {
        $placeholders = implode(',', array_fill(0, count($studentIds), '?'));
        $stmt = $pdo->prepare("select count(*) from feedback where mentor = ? or student_id in ($placeholders)");
        $stmt->execute([$mentor, ...$studentIds]);
    } else {
        $stmt = $pdo->prepare('select count(*) from feedback where mentor = ?');
        $stmt->execute([$mentor]);
    }
    $feedbackXp = (int)$stmt->fetchColumn() * 15;

    if ($studentIds) {
        $placeholders = implode(',', array_fill(0, count($studentIds), '?'));
        $stmt = $pdo->prepare("select count(*) from attendance where student_id in ($placeholders) and status = ?");
        $stmt->execute([...$studentIds, 'present']);
    } else {
        $stmt = $pdo->prepare('select count(attendance.id) from attendance join students on students.id = attendance.student_id where students.mentor = ? and attendance.status = ?');
        $stmt->execute([$mentor, 'present']);
    }
    $attendanceXp = (int)$stmt->fetchColumn() * 3;

    if ($studentIds) {
        $placeholders = implode(',', array_fill(0, count($studentIds), '?'));
        $stmt = $pdo->prepare("select coalesce(sum(bonus_points), 0) from parent_reviews where mentor = ? or student_id in ($placeholders)");
        $stmt->execute([$mentor, ...$studentIds]);
    } else {
        $stmt = $pdo->prepare('select coalesce(sum(bonus_points), 0) from parent_reviews where mentor = ?');
        $stmt->execute([$mentor]);
    }
    $parentReviewXp = (int)$stmt->fetchColumn();

    $stmt = $pdo->prepare('select coalesce(sum(amount), 0) from xp_adjustments where mentor = ?');
    $stmt->execute([$mentor]);
    $manualXp = (int)$stmt->fetchColumn();
    $amount = -($checksXp + $feedbackXp + $attendanceXp + $parentReviewXp + $manualXp);
    $stmt = $pdo->prepare('insert into xp_adjustments (mentor, amount, reason, date, created_by) values (?, ?, ?, ?, ?)');
    $stmt->execute([$mentor, $amount, 'Сброс XP администратором', date('Y-m-d'), $admin['name']]);
    data_response($pdo, $admin);
}

function create_schedule(PDO $pdo, array $admin, array $input): void
{
    $stmt = $pdo->prepare('insert into schedule (day, group_name, time, mentor) values (?, ?, ?, ?)');
    $stmt->execute([
        required($input, 'day'),
        required($input, 'group'),
        required($input, 'time'),
        required($input, 'mentor'),
    ]);
    data_response($pdo, $admin);
}

function create_trial(PDO $pdo, array $admin, array $input): void
{
    $program = strtoupper((string)($input['program'] ?? 'A')) === 'B' ? 'B' : 'A';
    $slot = find_trial_slot($pdo, $program, $input['preferredDate'] ?? date('Y-m-d'));
    if (!$slot) {
        fail("Нет свободного времени для программы $program. Добавьте расписание или освободите группу.", 422);
    }
    $stmt = $pdo->prepare('
        insert into trial_lessons (child_name, parent_name, phone, program, group_name, day, time, date, mentor, status, note, created_by)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ');
    $stmt->execute([
        required($input, 'childName'),
        required($input, 'parentName'),
        required($input, 'phone'),
        $program,
        $slot['group_name'],
        $slot['day'],
        $slot['time'],
        $slot['date'],
        $slot['mentor'],
        'scheduled',
        $input['note'] ?? '',
        $admin['name'],
    ]);
    data_response($pdo, $admin);
}

function update_trial_status(PDO $pdo, array $user, array $input): void
{
    $status = $input['status'] ?? 'scheduled';
    if (!in_array($status, ['scheduled', 'confirmed', 'visited', 'missed', 'converted', 'cancelled'], true)) {
        fail('Некорректный статус пробного урока.', 422);
    }
    $stmt = $pdo->prepare('select * from trial_lessons where id = ?');
    $stmt->execute([(int)required($input, 'id')]);
    $trial = $stmt->fetch();
    if (!$trial) fail('Пробный урок не найден.', 404);
    if ($user['role'] !== 'admin' && ($trial['mentor'] !== $user['name'] && !in_array($trial['group_name'], user_groups($user), true))) {
        fail('Нет доступа к этому пробному уроку.', 403);
    }
    $stmt = $pdo->prepare('update trial_lessons set status = ? where id = ?');
    $stmt->execute([$status, (int)$trial['id']]);
    data_response($pdo, $user);
}

function find_trial_slot(PDO $pdo, string $program, string $preferredDate): ?array
{
    $stmt = $pdo->prepare('select * from schedule order by id asc');
    $stmt->execute();
    $slots = [];
    foreach ($stmt->fetchAll() as $lesson) {
        if (group_program($lesson['group_name']) !== $program) continue;
        $occupied = group_occupancy($pdo, $lesson['group_name']);
        $capacity = group_capacity($lesson['group_name']);
        if ($occupied >= $capacity) continue;
        $lesson['date'] = next_date_for_day($lesson['day'], $preferredDate);
        $lesson['free'] = $capacity - $occupied;
        $slots[] = $lesson;
    }
    usort($slots, fn($a, $b) => strcmp($a['date'], $b['date']) ?: ($b['free'] <=> $a['free']) ?: strcmp($a['time'], $b['time']));
    return $slots[0] ?? null;
}

function group_program(string $group): string
{
    return preg_match('/(^|\s|-)b(\s|$|-)|программа\s*b|program\s*b|senior|advanced/ui', $group) ? 'B' : 'A';
}

function group_capacity(string $group): int
{
    return group_program($group) === 'B' ? 9 : 7;
}

function group_occupancy(PDO $pdo, string $group): int
{
    $stmt = $pdo->prepare('select count(*) from students where group_name = ? and status != ?');
    $stmt->execute([$group, 'pause']);
    $students = (int)$stmt->fetchColumn();
    $stmt = $pdo->prepare("select count(*) from trial_lessons where group_name = ? and status in ('scheduled', 'confirmed')");
    $stmt->execute([$group]);
    return $students + (int)$stmt->fetchColumn();
}

function next_date_for_day(string $day, string $fromDate): string
{
    $map = ['Вс' => 0, 'Пн' => 1, 'Вт' => 2, 'Ср' => 3, 'Чт' => 4, 'Пт' => 5, 'Сб' => 6];
    $target = $map[$day] ?? (int)date('w', strtotime($fromDate));
    $timestamp = strtotime($fromDate) ?: time();
    $current = (int)date('w', $timestamp);
    $diff = ($target - $current + 7) % 7;
    return date('Y-m-d', strtotime("+$diff days", $timestamp));
}

function create_salary(PDO $pdo, array $admin, array $input): void
{
    $stmt = $pdo->prepare('insert into salaries (mentor, period, amount, pay_date, status, note) values (?, ?, ?, ?, ?, ?)');
    $stmt->execute([
        required($input, 'mentor'),
        required($input, 'period'),
        (int)required($input, 'amount'),
        $input['payDate'] ?? '',
        $input['status'] ?? 'pending',
        $input['note'] ?? '',
    ]);
    data_response($pdo, $admin);
}

function create_method(PDO $pdo, array $admin, array $input): void
{
    $stmt = $pdo->prepare('insert into methods (topic, group_name, mentor, lesson_date, link, file_url, description) values (?, ?, ?, ?, ?, ?, ?)');
    $stmt->execute([
        required($input, 'topic'),
        required($input, 'group'),
        $input['mentor'] ?? '',
        $input['lessonDate'] ?? '',
        $input['link'] ?? '',
        $input['fileUrl'] ?? '',
        $input['description'] ?? '',
    ]);
    data_response($pdo, $admin);
}

function create_announcement(PDO $pdo, array $admin, array $input): void
{
    $stmt = $pdo->prepare('insert into announcements (title, kind, text, expires_at) values (?, ?, ?, ?)');
    $stmt->execute([
        required($input, 'title'),
        $input['kind'] ?? 'news',
        required($input, 'text'),
        $input['expiresAt'] ?? null,
    ]);
    data_response($pdo, $admin);
}

function delete_simple(PDO $pdo, array $admin, array $input, string $table): void
{
    $allowed = ['schedule', 'salaries', 'methods', 'announcements', 'expenses'];
    if (!in_array($table, $allowed, true)) fail('Недоступная таблица.', 403);
    $stmt = $pdo->prepare("delete from $table where id = ?");
    $stmt->execute([(int)required($input, 'id')]);
    data_response($pdo, $admin);
}

function data_response(PDO $pdo, array $user): void
{
    respond(['user' => public_user($user), 'state' => state_for_user($pdo, $user)]);
}

function state_for_user(PDO $pdo, array $user): array
{
    $isAdmin = $user['role'] === 'admin';
    $isParent = $user['role'] === 'parent';
    $students = $isAdmin ? all_students($pdo) : ($isParent ? parent_students($pdo, $user) : mentor_students($pdo, $user));
    $ids = array_map(fn($student) => (int)$student['id'], $students);
    return [
        'users' => $isAdmin ? all_users($pdo) : [public_user($user)],
        'students' => $students,
        'payments' => $isAdmin ? all_payments($pdo) : ($isParent ? rows_for_ids($pdo, 'payments', $ids) : []),
        'expenses' => $isAdmin ? all_expenses($pdo) : [],
        'attendance' => rows_for_ids($pdo, 'attendance', $ids),
        'feedback' => rows_for_ids($pdo, 'feedback', $ids),
        'schedule' => $isAdmin ? all_schedule($pdo) : ($isParent ? schedule_for_students($pdo, $students) : mentor_schedule($pdo, $user)),
        'trialLessons' => $isAdmin ? all_trial_lessons($pdo) : ($isParent ? [] : mentor_trial_lessons($pdo, $user)),
        'lessonChecks' => $isAdmin ? all_lesson_checks($pdo) : ($isParent ? [] : mentor_lesson_checks($pdo, $user)),
        'tasks' => $isAdmin ? all_tasks($pdo) : ($isParent ? [] : user_tasks($pdo, $user)),
        'xpAdjustments' => $isAdmin ? all_xp_adjustments($pdo) : ($isParent ? [] : mentor_xp_adjustments($pdo, $user)),
        'salaries' => $isAdmin ? all_salaries($pdo) : ($isParent ? [] : mentor_salaries($pdo, $user)),
        'methods' => $isAdmin ? all_methods($pdo) : ($isParent ? [] : mentor_methods($pdo, $user)),
        'parentReviews' => $isAdmin ? all_parent_reviews($pdo) : parent_reviews_for_ids($pdo, $ids),
        'announcements' => all_announcements($pdo),
    ];
}

function all_users(PDO $pdo): array
{
    return array_map('public_user', $pdo->query('select * from users order by created_at desc')->fetchAll());
}

function all_students(PDO $pdo): array
{
    return array_map('student_row', $pdo->query('select * from students order by created_at desc')->fetchAll());
}

function mentor_students(PDO $pdo, array $user): array
{
    $groups = user_groups($user);
    if (!$groups) return [];
    $placeholders = implode(',', array_fill(0, count($groups), '?'));
    $stmt = $pdo->prepare("select * from students where group_name in ($placeholders) or mentor = ? order by created_at desc");
    $stmt->execute([...$groups, $user['name']]);
    return array_map('student_row', $stmt->fetchAll());
}

function parent_students(PDO $pdo, array $user): array
{
    $ids = array_values(array_filter(array_map('intval', user_groups($user))));
    if (!$ids) return [];
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $stmt = $pdo->prepare("select * from students where id in ($placeholders) order by created_at desc");
    $stmt->execute($ids);
    return array_map('student_row', $stmt->fetchAll());
}

function all_payments(PDO $pdo): array
{
    return array_map('payment_row', $pdo->query('select * from payments order by date desc, id desc')->fetchAll());
}

function all_expenses(PDO $pdo): array
{
    return array_map('expense_row', $pdo->query('select * from expenses order by date desc, id desc')->fetchAll());
}

function all_schedule(PDO $pdo): array
{
    return array_map('schedule_row', $pdo->query('select * from schedule order by id asc')->fetchAll());
}

function mentor_schedule(PDO $pdo, array $user): array
{
    $groups = user_groups($user);
    if (!$groups) return [];
    $placeholders = implode(',', array_fill(0, count($groups), '?'));
    $stmt = $pdo->prepare("select * from schedule where group_name in ($placeholders) or mentor = ? order by id asc");
    $stmt->execute([...$groups, $user['name']]);
    return array_map('schedule_row', $stmt->fetchAll());
}

function schedule_for_students(PDO $pdo, array $students): array
{
    $groups = array_values(array_unique(array_map(fn($student) => $student['group'], $students)));
    if (!$groups) return [];
    $placeholders = implode(',', array_fill(0, count($groups), '?'));
    $stmt = $pdo->prepare("select * from schedule where group_name in ($placeholders) order by id desc");
    $stmt->execute($groups);
    return array_map('schedule_row', $stmt->fetchAll());
}

function all_trial_lessons(PDO $pdo): array
{
    return array_map('trial_lesson_row', $pdo->query('select * from trial_lessons order by date desc, time asc, id desc')->fetchAll());
}

function mentor_trial_lessons(PDO $pdo, array $user): array
{
    $groups = user_groups($user);
    $params = [$user['name']];
    $sql = 'select * from trial_lessons where mentor = ?';
    if ($groups) {
        $placeholders = implode(',', array_fill(0, count($groups), '?'));
        $sql .= " or group_name in ($placeholders)";
        $params = [...$params, ...$groups];
    }
    $sql .= ' order by date desc, time asc, id desc';
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return array_map('trial_lesson_row', $stmt->fetchAll());
}

function all_salaries(PDO $pdo): array
{
    return array_map('salary_row', $pdo->query('select * from salaries order by pay_date desc, id desc')->fetchAll());
}

function mentor_salaries(PDO $pdo, array $user): array
{
    $stmt = $pdo->prepare('select * from salaries where mentor = ? order by pay_date desc, id desc');
    $stmt->execute([$user['name']]);
    return array_map('salary_row', $stmt->fetchAll());
}

function all_methods(PDO $pdo): array
{
    return array_map('method_row', $pdo->query('select * from methods order by lesson_date desc, id desc')->fetchAll());
}

function mentor_methods(PDO $pdo, array $user): array
{
    $groups = user_groups($user);
    $placeholders = $groups ? implode(',', array_fill(0, count($groups), '?')) : "''";
    $sql = "select * from methods where group_name = 'Все группы' or mentor = ?";
    $params = [$user['name']];
    if ($groups) {
        $sql .= " or group_name in ($placeholders)";
        $params = [...$params, ...$groups];
    }
    $sql .= ' order by lesson_date desc, id desc';
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return array_map('method_row', $stmt->fetchAll());
}

function all_lesson_checks(PDO $pdo): array
{
    return array_map('lesson_check_row', $pdo->query('select * from lesson_checks order by date desc, id desc')->fetchAll());
}

function mentor_lesson_checks(PDO $pdo, array $user): array
{
    $stmt = $pdo->prepare('select * from lesson_checks where mentor = ? order by date desc, id desc');
    $stmt->execute([$user['name']]);
    return array_map('lesson_check_row', $stmt->fetchAll());
}

function all_tasks(PDO $pdo): array
{
    return array_map('task_row', $pdo->query('select * from tasks order by created_at desc')->fetchAll());
}

function user_tasks(PDO $pdo, array $user): array
{
    $stmt = $pdo->prepare('select * from tasks where assignee = ? or created_by = ? order by created_at desc');
    $stmt->execute([$user['name'], $user['name']]);
    return array_map('task_row', $stmt->fetchAll());
}

function all_xp_adjustments(PDO $pdo): array
{
    return array_map('xp_adjustment_row', $pdo->query('select * from xp_adjustments order by date desc, id desc')->fetchAll());
}

function mentor_xp_adjustments(PDO $pdo, array $user): array
{
    $stmt = $pdo->prepare('select * from xp_adjustments where mentor = ? order by date desc, id desc');
    $stmt->execute([$user['name']]);
    return array_map('xp_adjustment_row', $stmt->fetchAll());
}

function rows_for_ids(PDO $pdo, string $table, array $ids): array
{
    if (!$ids) return [];
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $order = $table === 'payments' ? 'date desc, id desc' : 'date desc, id desc';
    $stmt = $pdo->prepare("select * from $table where student_id in ($placeholders) order by $order");
    $stmt->execute($ids);
    $mapper = $table === 'attendance' ? 'attendance_row' : ($table === 'payments' ? 'payment_row' : 'feedback_row');
    return array_map($mapper, $stmt->fetchAll());
}

function all_parent_reviews(PDO $pdo): array
{
    return array_map('parent_review_row', $pdo->query('select * from parent_reviews order by date desc, id desc')->fetchAll());
}

function parent_reviews_for_ids(PDO $pdo, array $ids): array
{
    if (!$ids) return [];
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $stmt = $pdo->prepare("select * from parent_reviews where student_id in ($placeholders) order by date desc, id desc");
    $stmt->execute($ids);
    return array_map('parent_review_row', $stmt->fetchAll());
}

function all_announcements(PDO $pdo): array
{
    return array_map('announcement_row', $pdo->query('select * from announcements order by created_at desc, id desc')->fetchAll());
}

function insert_user(PDO $pdo, array $user): int
{
    $email = strtolower(trim((string)$user['email']));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        fail('Некорректный email.', 422);
    }
    $stmt = $pdo->prepare('insert into users (name, email, password_hash, role, groups_json) values (?, ?, ?, ?, ?)');
    $stmt->execute([
        trim((string)$user['name']),
        $email,
        password_hash((string)$user['password'], PASSWORD_DEFAULT),
        $user['role'],
        json_encode(normalize_groups($user['groups']), JSON_UNESCAPED_UNICODE),
    ]);
    return (int)$pdo->lastInsertId();
}

function require_user(PDO $pdo): array
{
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!preg_match('/Bearer\s+(.+)/', $header, $matches)) {
        fail('Требуется вход.', 401);
    }
    $stmt = $pdo->prepare('select users.* from sessions join users on users.id = sessions.user_id where sessions.token = ?');
    $stmt->execute([$matches[1]]);
    $user = $stmt->fetch();
    if (!$user) {
        fail('Сессия истекла.', 401);
    }
    return $user;
}

function require_admin(PDO $pdo): array
{
    $user = require_user($pdo);
    if ($user['role'] !== 'admin') {
        fail('Доступно только администратору.', 403);
    }
    return $user;
}

function assert_student_access(PDO $pdo, array $user, int $studentId): void
{
    if ($user['role'] === 'admin') return;
    if ($user['role'] === 'parent') {
        if (in_array((string)$studentId, user_groups($user), true) || in_array($studentId, array_map('intval', user_groups($user)), true)) {
            return;
        }
        fail('Родитель видит только привязанных детей.', 403);
    }
    $stmt = $pdo->prepare('select * from students where id = ?');
    $stmt->execute([$studentId]);
    $student = $stmt->fetch();
    if (!$student) fail('Ученик не найден.', 404);
    if (!in_array($student['group_name'], user_groups($user), true) && $student['mentor'] !== $user['name']) {
        fail('Нет доступа к этому ученику.', 403);
    }
}

function get_student(PDO $pdo, int $studentId): array
{
    $stmt = $pdo->prepare('select * from students where id = ?');
    $stmt->execute([$studentId]);
    return $stmt->fetch() ?: fail('Ученик не найден.', 404);
}

function create_session(PDO $pdo, int $userId): string
{
    $token = bin2hex(random_bytes(32));
    $stmt = $pdo->prepare('insert into sessions (token, user_id) values (?, ?)');
    $stmt->execute([$token, $userId]);
    return $token;
}

function logout(PDO $pdo, array $user): void
{
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (preg_match('/Bearer\s+(.+)/', $header, $matches)) {
        $stmt = $pdo->prepare('delete from sessions where token = ?');
        $stmt->execute([$matches[1]]);
    }
    respond(['ok' => true]);
}

function has_users(PDO $pdo): bool
{
    return (int)$pdo->query('select count(*) from users')->fetchColumn() > 0;
}

function get_user_by_id(PDO $pdo, int $id): array
{
    $stmt = $pdo->prepare('select * from users where id = ?');
    $stmt->execute([$id]);
    return $stmt->fetch() ?: fail('Пользователь не найден.', 404);
}

function public_user(array $user): array
{
    return [
        'id' => (int)$user['id'],
        'name' => $user['name'],
        'email' => $user['email'],
        'role' => $user['role'],
        'groups' => user_groups($user),
    ];
}

function user_groups(array $user): array
{
    return normalize_groups(json_decode($user['groups_json'] ?? '[]', true) ?: []);
}

function normalize_groups(mixed $groups): array
{
    if (is_string($groups)) {
        $groups = explode(',', $groups);
    }
    if (!is_array($groups)) return [];
    return array_values(array_filter(array_map(fn($group) => trim((string)$group), $groups)));
}

function student_row(array $row): array
{
    return [
        'id' => (int)$row['id'],
        'name' => $row['name'],
        'course' => $row['course'],
        'group' => $row['group_name'],
        'parent' => $row['parent'],
        'phone' => $row['phone'],
        'mentor' => $row['mentor'],
        'status' => $row['status'],
        'lessonsLeft' => (int)$row['lessons_left'],
        'progress' => (int)$row['progress'],
        'nextPayment' => $row['next_payment'],
    ];
}

function payment_row(array $row): array
{
    return [
        'id' => (int)$row['id'],
        'studentId' => (int)$row['student_id'],
        'plan' => $row['plan'],
        'amount' => (int)$row['amount'],
        'status' => $row['status'],
        'date' => $row['date'],
    ];
}

function expense_row(array $row): array
{
    return [
        'id' => (int)$row['id'],
        'title' => $row['title'],
        'amount' => (int)$row['amount'],
        'category' => $row['category'],
        'date' => $row['date'],
        'note' => $row['note'] ?? '',
        'createdBy' => $row['created_by'],
    ];
}

function attendance_row(array $row): array
{
    return [
        'id' => (int)$row['id'],
        'studentId' => (int)$row['student_id'],
        'date' => $row['date'],
        'status' => $row['status'],
        'topic' => $row['topic'],
    ];
}

function feedback_row(array $row): array
{
    return [
        'id' => (int)$row['id'],
        'studentId' => (int)$row['student_id'],
        'mentor' => $row['mentor'],
        'skill' => $row['skill'],
        'text' => $row['text'],
        'date' => $row['date'],
    ];
}

function parent_review_row(array $row): array
{
    return [
        'id' => (int)$row['id'],
        'studentId' => (int)$row['student_id'],
        'parentId' => (int)$row['parent_id'],
        'attendanceId' => isset($row['attendance_id']) ? (int)$row['attendance_id'] : null,
        'mentor' => $row['mentor'],
        'rating' => (int)$row['rating'],
        'text' => $row['text'],
        'bonusPoints' => (int)$row['bonus_points'],
        'date' => $row['date'],
    ];
}

function announcement_row(array $row): array
{
    return [
        'id' => (int)$row['id'],
        'title' => $row['title'],
        'kind' => $row['kind'],
        'text' => $row['text'],
        'expiresAt' => $row['expires_at'],
    ];
}

function schedule_row(array $row): array
{
    return [
        'id' => (int)$row['id'],
        'day' => $row['day'],
        'group' => $row['group_name'],
        'time' => $row['time'],
        'mentor' => $row['mentor'],
    ];
}

function trial_lesson_row(array $row): array
{
    return [
        'id' => (int)$row['id'],
        'childName' => $row['child_name'],
        'parentName' => $row['parent_name'],
        'phone' => $row['phone'],
        'program' => $row['program'],
        'group' => $row['group_name'],
        'day' => $row['day'],
        'time' => $row['time'],
        'date' => $row['date'],
        'mentor' => $row['mentor'],
        'status' => $row['status'],
        'note' => $row['note'] ?? '',
        'createdBy' => $row['created_by'],
    ];
}

function lesson_check_row(array $row): array
{
    return [
        'id' => (int)$row['id'],
        'mentor' => $row['mentor'],
        'group' => $row['group_name'],
        'date' => $row['date'],
        'score' => (int)$row['score'],
        'comment' => $row['comment'] ?? '',
    ];
}

function task_row(array $row): array
{
    return [
        'id' => (int)$row['id'],
        'title' => $row['title'],
        'description' => $row['description'] ?? '',
        'assignee' => $row['assignee'],
        'priority' => $row['priority'],
        'status' => $row['status'],
        'dueDate' => $row['due_date'] ?? '',
        'createdBy' => $row['created_by'],
    ];
}

function salary_row(array $row): array
{
    return [
        'id' => (int)$row['id'],
        'mentor' => $row['mentor'],
        'period' => $row['period'],
        'amount' => (int)$row['amount'],
        'payDate' => $row['pay_date'] ?? '',
        'status' => $row['status'],
        'note' => $row['note'] ?? '',
    ];
}

function method_row(array $row): array
{
    return [
        'id' => (int)$row['id'],
        'topic' => $row['topic'],
        'group' => $row['group_name'],
        'mentor' => $row['mentor'] ?? '',
        'lessonDate' => $row['lesson_date'] ?? '',
        'link' => $row['link'] ?? '',
        'fileUrl' => $row['file_url'] ?? '',
        'description' => $row['description'] ?? '',
    ];
}

function xp_adjustment_row(array $row): array
{
    return [
        'id' => (int)$row['id'],
        'mentor' => $row['mentor'],
        'amount' => (int)$row['amount'],
        'reason' => $row['reason'],
        'date' => $row['date'],
        'createdBy' => $row['created_by'],
    ];
}

function required(array $input, string $key): string
{
    $value = trim((string)($input[$key] ?? ''));
    if ($value === '') {
        fail("Поле $key обязательно.", 422);
    }
    return $value;
}

function respond(array $data): never
{
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function fail(string $message, int $status = 400): never
{
    http_response_code($status);
    echo json_encode(['error' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}
