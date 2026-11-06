# Chat by Barsik

Мессенджер на Next.js и Supabase: регистрация, профили, приватные диалоги и realtime-сообщения. Демонстрационных аккаунтов и предзаполненных данных нет.

## Установка

1. Создайте проект Supabase и выполните `supabase/schema.sql` через SQL Editor.
2. Скопируйте `.env.example` в `.env.local` и задайте URL и anon key проекта.
3. Установите Node.js 20.9+, затем выполните:

```bash
npm install
npm run dev
```

Откройте http://localhost:3000. Стартовый экран — регистрация; для существующих пользователей есть переключение на вход.

## GitHub Pages

В **Settings → Pages** выберите **GitHub Actions**. Добавьте Actions secrets `NEXT_PUBLIC_SUPABASE_URL` и `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Workflow `.github/workflows/deploy-pages.yml` собирает сайт и публикует его по адресу `https://Egortest1.github.io/chat-by-barsik/`.

> Никогда не публикуйте Supabase `service_role` key. Для клиентского приложения используется только anon key и доступ ограничивается RLS.
