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
        'create_payment' => create_payment($pdo, require_admin($pdo), $input),
        'create_attendance' => create_attendance($pdo, require_user($pdo), $input),
        'toggle_attendance' => toggle_attendance($pdo, require_user($pdo), $input),
        'create_feedback' => create_feedback($pdo, require_user($pdo), $input),
        'create_lesson_check' => create_lesson_check($pdo, require_user($pdo), $input),
        'create_task' => create_task($pdo, require_user($pdo), $input),
        'update_task_status' => update_task_status($pdo, require_user($pdo), $input),
        'delete_task' => delete_task($pdo, require_user($pdo), $input),
        'delete_student' => delete_student($pdo, require_admin($pdo), $input),
        'delete_user' => delete_user($pdo, require_admin($pdo), $input),
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
            role text not null check (role in ('admin', 'mentor')),
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
    ");
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
    insert_user($pdo, [
        'name' => required($input, 'name'),
        'email' => required($input, 'email'),
        'password' => required($input, 'password'),
        'role' => in_array(($input['role'] ?? 'mentor'), ['admin', 'mentor'], true) ? $input['role'] : 'mentor',
        'groups' => normalize_groups($input['groups'] ?? []),
    ]);
    data_response($pdo, $admin);
}

function create_student(PDO $pdo, array $admin, array $input): void
{
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
        (int)($input['lessonsLeft'] ?? 0),
        (int)($input['progress'] ?? 10),
        $input['nextPayment'] ?? date('Y-m-d', strtotime('+30 days')),
    ]);
    data_response($pdo, $admin);
}

function create_payment(PDO $pdo, array $admin, array $input): void
{
    $stmt = $pdo->prepare('insert into payments (student_id, plan, amount, status, date) values (?, ?, ?, ?, ?)');
    $stmt->execute([
        (int)required($input, 'studentId'),
        required($input, 'plan'),
        (int)required($input, 'amount'),
        $input['status'] ?? 'paid',
        required($input, 'date'),
    ]);
    data_response($pdo, $admin);
}

function create_attendance(PDO $pdo, array $user, array $input): void
{
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
    data_response($pdo, $user);
}

function toggle_attendance(PDO $pdo, array $user, array $input): void
{
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
    data_response($pdo, $user);
}

function create_feedback(PDO $pdo, array $user, array $input): void
{
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

function data_response(PDO $pdo, array $user): void
{
    respond(['user' => public_user($user), 'state' => state_for_user($pdo, $user)]);
}

function state_for_user(PDO $pdo, array $user): array
{
    $isAdmin = $user['role'] === 'admin';
    $students = $isAdmin ? all_students($pdo) : mentor_students($pdo, $user);
    $ids = array_map(fn($student) => (int)$student['id'], $students);
    return [
        'users' => $isAdmin ? all_users($pdo) : [public_user($user)],
        'students' => $students,
        'payments' => $isAdmin ? all_payments($pdo) : [],
        'attendance' => rows_for_ids($pdo, 'attendance', $ids),
        'feedback' => rows_for_ids($pdo, 'feedback', $ids),
        'schedule' => $isAdmin ? all_schedule($pdo) : mentor_schedule($pdo, $user),
        'lessonChecks' => $isAdmin ? all_lesson_checks($pdo) : mentor_lesson_checks($pdo, $user),
        'tasks' => $isAdmin ? all_tasks($pdo) : user_tasks($pdo, $user),
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

function all_payments(PDO $pdo): array
{
    return array_map('payment_row', $pdo->query('select * from payments order by date desc, id desc')->fetchAll());
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

function rows_for_ids(PDO $pdo, string $table, array $ids): array
{
    if (!$ids) return [];
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $stmt = $pdo->prepare("select * from $table where student_id in ($placeholders) order by date desc, id desc");
    $stmt->execute($ids);
    $mapper = $table === 'attendance' ? 'attendance_row' : 'feedback_row';
    return array_map($mapper, $stmt->fetchAll());
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
    $stmt = $pdo->prepare('select * from students where id = ?');
    $stmt->execute([$studentId]);
    $student = $stmt->fetch();
    if (!$student) fail('Ученик не найден.', 404);
    if (!in_array($student['group_name'], user_groups($user), true) && $student['mentor'] !== $user['name']) {
        fail('Нет доступа к этому ученику.', 403);
    }
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
