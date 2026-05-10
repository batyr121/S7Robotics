create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('admin', 'mentor')),
  created_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  course text not null,
  mentor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  group_id uuid not null references public.groups(id) on delete restrict,
  parent_name text not null,
  parent_phone text not null,
  status text not null default 'active' check (status in ('active', 'trial', 'pause')),
  lessons_left int not null default 0,
  progress int not null default 0 check (progress between 0 and 100),
  next_payment_date date,
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  plan_name text not null,
  amount int not null check (amount >= 0),
  status text not null check (status in ('paid', 'soon', 'overdue')),
  paid_at date not null,
  created_at timestamptz not null default now()
);

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  lesson_date date not null,
  status text not null check (status in ('present', 'absent')),
  topic text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (student_id, lesson_date)
);

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  mentor_id uuid references public.profiles(id) on delete set null,
  skill text not null,
  note text not null,
  feedback_date date not null,
  created_at timestamptz not null default now()
);

create table public.schedule (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  weekday text not null check (weekday in ('Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс')),
  starts_at time not null,
  mentor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.mentor_groups (
  mentor_id uuid not null references public.profiles(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  primary key (mentor_id, group_id)
);

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.students enable row level security;
alter table public.payments enable row level security;
alter table public.attendance enable row level security;
alter table public.feedback enable row level security;
alter table public.schedule enable row level security;
alter table public.mentor_groups enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.can_access_group(group_uuid uuid)
returns boolean
language sql
security definer
stable
as $$
  select public.is_admin()
    or exists (
      select 1 from public.mentor_groups
      where mentor_id = auth.uid() and group_id = group_uuid
    );
$$;

create policy "profiles read own or admin"
on public.profiles for select
using (id = auth.uid() or public.is_admin());

create policy "admins manage profiles"
on public.profiles for all
using (public.is_admin())
with check (public.is_admin());

create policy "groups visible by access"
on public.groups for select
using (public.can_access_group(id));

create policy "admins manage groups"
on public.groups for all
using (public.is_admin())
with check (public.is_admin());

create policy "students visible by group"
on public.students for select
using (public.can_access_group(group_id));

create policy "admins manage students"
on public.students for all
using (public.is_admin())
with check (public.is_admin());

create policy "payments admin only"
on public.payments for all
using (public.is_admin())
with check (public.is_admin());

create policy "attendance visible by student group"
on public.attendance for select
using (
  exists (
    select 1 from public.students
    where students.id = attendance.student_id
      and public.can_access_group(students.group_id)
  )
);

create policy "attendance mentor or admin write"
on public.attendance for all
using (
  public.is_admin()
  or exists (
    select 1 from public.students
    where students.id = attendance.student_id
      and public.can_access_group(students.group_id)
  )
)
with check (
  public.is_admin()
  or exists (
    select 1 from public.students
    where students.id = attendance.student_id
      and public.can_access_group(students.group_id)
  )
);

create policy "feedback visible by student group"
on public.feedback for select
using (
  exists (
    select 1 from public.students
    where students.id = feedback.student_id
      and public.can_access_group(students.group_id)
  )
);

create policy "feedback mentor or admin write"
on public.feedback for all
using (
  public.is_admin()
  or mentor_id = auth.uid()
)
with check (
  public.is_admin()
  or mentor_id = auth.uid()
);

create policy "schedule visible by group"
on public.schedule for select
using (public.can_access_group(group_id));

create policy "admins manage schedule"
on public.schedule for all
using (public.is_admin())
with check (public.is_admin());

create policy "mentor groups visible"
on public.mentor_groups for select
using (mentor_id = auth.uid() or public.is_admin());

create policy "admins manage mentor groups"
on public.mentor_groups for all
using (public.is_admin())
with check (public.is_admin());
