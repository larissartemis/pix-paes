<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Padrões de UI, Estilização e Arquitetura

- **Tailwind CSS v4 + shadcn/ui**: utilize os componentes base em `src/components/ui/` (`Button`, `Input`, `Label`, `Card`, `Badge`, etc.) e o helper `cn()` de `src/lib/utils.ts`.
- **Tokens e variáveis CSS**: sempre use as variáveis de tema definidas em `src/app/globals.css` (`bg-background`, `text-foreground`, `bg-card`, `text-muted-foreground`, `bg-primary`, `text-primary-foreground`, `border-border`, `border-input`, `ring-ring`, etc.) em vez de cores hardcoded, garantindo consistência visual.
- **Estrutura de pastas**:
  - `src/app/(auth)/`: páginas públicas de autenticação (`/login`, `/esqueci-senha`, `/redefinir-senha`, etc.).
  - `src/app/(app)/`: páginas protegidas por `<AuthGate>` (`/`, `/leitor`, e futuras telas de `/clientes` e `/relatorios`).
  - `src/services/`: camada de serviços para comunicação com Supabase (`auth.service.ts`, etc.).
  - `src/app/api/`: Route Handlers server-side (`/api/parse-pdf`, `/api/parse-url`).
  - `src/types/database.types.ts`: tipagens geradas do schema `pix` do Supabase.
