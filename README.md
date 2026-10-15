# FixFlowOS

SaaS multi-tenant para gestão de assistências técnicas de celulares e tablets. Frontend React/Vite, Firebase Authentication, Cloud Firestore e funções serverless da Vercel para operações administrativas e transacionais.

> **Estado do projeto:** este repositório contém a implementação-base funcional e as principais telas/endpoints. Antes de uso comercial, configure o seu projeto Firebase, execute os testes de regras/transações descritos abaixo e faça uma revisão de segurança. Nenhuma credencial ou projeto Firebase real acompanha o ZIP.

## Requisitos técnicos

- Node.js 20 ou superior (recomendado Node 22)
- npm
- Projeto Firebase com Authentication e Cloud Firestore
- Deploy Vercel com funções Node.js habilitadas

## Instalação local

```bash
npm install
cp .env.example .env
npm run dev
```

`npm run dev` inicia o frontend Vite. Para testar também as funções `/api`, use a CLI da Vercel no ambiente local:

```bash
npx vercel dev
```

As funções administrativas precisam das variáveis privadas descritas abaixo. Não publique o arquivo `.env` no Git.

## Configuração do Firebase

1. No Firebase Console, crie ou selecione o projeto que será utilizado pelo FixFlowOS.
2. Em **Configurações do projeto → Geral**, registre uma aplicação Web e copie os campos do `firebaseConfig` para as variáveis `VITE_FIREBASE_*` do `.env`.
3. Em **Authentication → Sign-in method**, habilite **E-mail/senha**.
4. Em **Firestore Database**, crie o banco na região escolhida para a operação. A região não pode ser trocada depois da criação; escolha uma região compatível com a localização da operação e os requisitos de latência/privacidade.
5. Publique as regras e índices incluídos neste projeto. Com Firebase CLI instalada e inicializada para o projeto correto:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

O `firebase.json` aponta para `firestore.rules` e `firestore.indexes.json`.

### Variáveis públicas do frontend

Preencha as variáveis do `.env`:

```dotenv
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

Esses campos são a configuração do SDK web do Firebase. Eles **não substituem** as regras do Firestore. A segurança depende principalmente das regras e da validação server-side.

### Variáveis privadas das funções da Vercel

Configure nas variáveis de ambiente privadas do projeto Vercel (e localmente no ambiente usado por `vercel dev`):

- `FIREBASE_SERVICE_ACCOUNT_JSON`: JSON minificado de uma service account com privilégios administrativos suficientes para Auth e Firestore. Trate-o como segredo.
- `APP_DATA_ENCRYPTION_KEY`: segredo aleatório de pelo menos 32 caracteres, usado para criptografar senhas de desbloqueio de aparelhos com AES-256-GCM. Guarde-o em um gerenciador de segredos; não o altere sem um plano de migração dos dados criptografados.

**Nunca** prefixe essas variáveis com `VITE_`, nunca inclua service account no ZIP/Git e nunca compartilhe o JSON. As funções usam Firebase Admin SDK no servidor, não no navegador.

### Provisionamento do primeiro Super Admin

1. Crie a conta do operador no Firebase Authentication, usando o fluxo seguro aprovado pela sua operação.
2. No ambiente administrativo seguro, defina `FIREBASE_SERVICE_ACCOUNT_JSON` e execute:

```bash
node scripts/provision-superadmin.mjs operador@seudominio.com
```

3. Encerre a sessão desse usuário e entre novamente para atualizar o ID token e obter a custom claim `superAdmin`.

O script atribui explicitamente a custom claim e atualiza o perfil protegido em `usuarios/{uid}`. Nenhum e-mail, incluindo `karlaopba@gmail.com`, recebe Super Admin automaticamente. Execute esse script somente em ambiente confiável.

### Primeira loja e proprietário

Depois de entrar com a conta Super Admin provisionada, utilize **Super Admin → Nova loja**. A função serverless cria a loja, o perfil do proprietário, a assinatura, o contador de OS e o controle inicial do limite de usuários. A senha inicial é enviada ao Firebase Authentication, não ao Firestore; use uma senha temporária e combine a troca com o proprietário por canal seguro.

### Estrutura inicial dos dados

- `usuarios/{uid}`: perfil e vínculo de usuário.
- `lojas/{lojaId}`: dados públicos operacionais da loja e referência ao proprietário.
- `lojas/{lojaId}/configuracoes/geral`: contador sequencial da OS e configuração de status.
- `lojas/{lojaId}/assinatura/atual`: plano, preço, período, vigência e status.
- Subcoleções por loja: OS, produtos, vendas, caixas, movimentações, equipe, lançamentos de RH, custos privados e controles internos.

Os custos de estoque ficam em `estoqueCustos/{produtoId}`, separado do catálogo de produtos, para não expor custo de aquisição a vendedor/técnico por meio de documentos que eles podem ler.

## Deploy na Vercel

1. Importe o repositório na Vercel ou conecte o projeto à fonte de versionamento utilizada pela equipe.
2. Configure as seis variáveis `VITE_FIREBASE_*` no ambiente correspondente (Production, Preview e Development, conforme necessário).
3. Configure `FIREBASE_SERVICE_ACCOUNT_JSON` e `APP_DATA_ENCRYPTION_KEY` como **Environment Variables privadas** para as funções serverless. Não exponha esses valores ao browser.
4. Build command: `npm run build`.
5. Output directory: `dist`.
6. O arquivo `vercel.json` configura o rewrite de SPA para que rotas React funcionem quando abertas diretamente. As funções da pasta `api/` devem continuar sendo tratadas como Serverless Functions.
7. No Firebase Authentication, inclua o domínio de produção da Vercel e os domínios locais efetivamente utilizados na lista de domínios autorizados.
8. Execute um deploy Preview e valide os testes de permissão antes do Production.

## Comandos

```bash
npm run dev       # Frontend Vite
npm run build     # Build de produção
npm run preview   # Visualizar localmente o build
npx vercel dev    # Frontend + funções serverless localmente
```

## Operações privilegiadas implementadas

- `POST /api/admin/lojas`: cria loja e usuário proprietário, com plano e teste grátis opcional.
- `GET /api/admin/lojas`: lista lojas e assinaturas para Super Admin.
- `POST /api/admin/assinatura`: altera status, preço/período ou renova a assinatura.
- `POST /api/admin/alterar-senha-dono`: atualiza a senha do proprietário através do Admin SDK.
- `POST /api/loja/ordens-servico`: cria/atualiza OS, gera número sequencial com transação e criptografa senha de aparelho.
- `GET /api/loja/ordens-servico?osId=...`: revela a senha armazenada apenas mediante autenticação e autorização de cargo, quando necessária.
- `POST /api/loja/estoque`: salva produtos e registra movimentos de inventário pelo servidor.
- `POST /api/loja/vendas`: recalcula total a partir dos preços do Firestore, cria venda, baixa estoque e registra movimento idempotente; a ação `cancelar` (Admin) estorna o estoque e registra o ajuste de caixa ou um reembolso pendente.
- `POST /api/loja/caixa`: abre, movimenta e fecha caixa com controle transacional; permite ao Admin conciliar reembolsos pendentes de vendas em dinheiro.
- `POST /api/loja/funcionarios`: provisiona funcionário, reserva e aplica limite de usuários no servidor; a ação `atualizar` altera cargo permitido e suspende/reativa funcionário respeitando o limite do plano.

## Testes recomendados antes de produção

### Build

```bash
npm install
npm run build
```

### Autenticação e isolamento

1. Crie duas lojas de teste com proprietários distintos.
2. Confirme que cada proprietário vê apenas os dados de sua loja.
3. Tente executar consultas diretamente com o SDK Firebase e com credenciais de usuário para a loja alheia; as regras devem negar a operação.
4. Confirme que usuários comuns não conseguem alterar `cargo`, `lojaId`, `superAdmin`, assinatura, contador de OS ou controles internos.
5. Confirme que técnico consegue ler catálogo do estoque, mas as operações de escrita são negadas no Firestore e os endpoints também negam a alteração de estoque.

### Numeração sequencial

1. Abra a tela de OS com dois usuários da mesma loja.
2. Crie várias OS simultaneamente.
3. Confirme que `numeroOS` é único e incremental e que a listagem ordena numericamente.
4. Confira o contador em `configuracoes/geral`.

### Vendas e caixa

1. Tente finalizar uma venda com estoque insuficiente.
2. Envie repetidamente a mesma requisição com o mesmo `idempotencyKey` e confirme que não há segunda baixa.
3. Confira catálogo, histórico de movimentações, venda e movimento de caixa.
4. Abra dois pedidos de abertura de caixa simultaneamente e confirme que apenas um é aceito.
5. Confira saldo esperado, dinheiro contado e diferença registrada no fechamento.

### Assinaturas

1. Teste todos os períodos: Semanal, Mensal, 3 Meses, 1 Ano e Vitalício.
2. Confira o vencimento do teste grátis de sete dias.
3. Confirme que assinaturas vencidas/suspensas não permitem acesso às operações comerciais.
4. Confirme que Super Admin continua sendo validado por custom claim, não por e-mail digitado no frontend.

## Observações importantes

- Senhas de aparelho são informação sensível. O sistema as criptografa no servidor com AES-256-GCM quando a variável de criptografia está configurada. O acesso para revelar é explícito e deve ser limitado a funcionários que realmente precisem dela; estabeleça política de retenção e remoção.
- Os valores do dashboard são calculados a partir dos documentos disponíveis. Para contabilidade formal, conciliação financeira e lucro líquido, defina uma política contábil e valide as fórmulas com um profissional qualificado.
- O pacote não inclui gateway de pagamento. A assinatura é administrada pelo Super Admin, sem simular cobranças.
- Firebase Admin SDK ignora Firestore Security Rules. Por isso, toda função serverless deve autenticar o token, verificar cargo/tenant, validar os campos e fazer as operações privilegiadas dentro de transações quando cabível.
- Não trate a publicação como automaticamente certificada para produção. Faça revisão independente das regras, endpoints e políticas de dados antes de operar com dados reais de clientes.
