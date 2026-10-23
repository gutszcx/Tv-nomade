# Nomad TV

Aplicativo de TV ao vivo com catálogo de canais, agenda de eventos esportivos e guia de programação (EPG), construído sobre as APIs públicas do [embedtv.cc](https://embedtv.cc). O projeto entrega duas versões do mesmo produto:

- **Web app** servido por um proxy Express com cache.
- **App Android** nativo em Kotlin, com WebView, assets locais e proxy de API embutido.

> A Nomad TV organiza o catálogo e a programação. Os sinais de vídeo são fornecidos por terceiros e não são hospedados por este projeto.

## Recursos

- Home com destaques ao vivo, hero rotativo e trilhos de canais, eventos e programas.
- Catálogo com 147 canais, filtros por categoria, busca, ordenação e favoritos.
- Agenda de eventos com status ao vivo, contagem regressiva e múltiplos sinais por evento.
- Guia de TV com grade por horário, linha do tempo, filtro por dia/canal e busca.
- Player imersivo com tela cheia, modo cinema, troca de sinal, compartilhamento e canais relacionados.
- Minha lista com canais favoritos, eventos favoritos e histórico.
- Busca global em canais, eventos e programas, com paleta de comandos (`/` ou `Ctrl/Cmd + K`).
- Interface responsiva em pt-BR, tema escuro, atalhos de teclado e estados de carregamento/erro.

## Estrutura

```text
Tv-Nomad/
├── server.js                  # proxy Express, cache, imagens e SPA fallback
├── build.gradle.kts           # configuração raiz do projeto Gradle
├── settings.gradle.kts
├── gradlew                    # wrapper do Gradle
├── gradle/wrapper/
├── app/                       # módulo Android (Kotlin + WebView)
│   ├── build.gradle.kts
│   └── src/main/
│       ├── assets/public/     # front-end compartilhado entre web e Android
│       │   ├── index.html
│       │   ├── manifest.webmanifest
│       │   ├── assets/icon.svg
│       │   ├── css/styles.css
│       │   └── js/
│       │       ├── app.js             # boot, chrome, favoritos, atalhos
│       │       ├── router.js          # rotas SPA
│       │       ├── store.js           # estado, EPG, favoritos e histórico
│       │       ├── api.js             # cliente HTTP
│       │       ├── components.js      # cards, trilhos, estados vazios
│       │       ├── search-palette.js  # busca global
│       │       ├── utils.js
│       │       └── views/             # home, canais, eventos, guia, lista, busca, player
│       ├── java/com/nomadtv/app/
│       │   ├── MainActivity.kt    # WebView, fullscreen, back, bridge
│       │   └── ApiProxy.kt        # proxy OkHttp com cache e whitelist de imagens
│       └── res/                   # tema, ícones e strings
└── .github/workflows/android.yml
```

## Web

Requisitos: Node.js 18.17+.

```bash
npm install
npm start
```

Acesse `http://localhost:3000`.

Para desenvolvimento com recarga do servidor:

```bash
npm run dev
```

O servidor expõe:

| Rota | Descrição |
| --- | --- |
| `GET /api/channels` | Canais e categorias |
| `GET /api/events` | Eventos com status calculado |
| `GET /api/epg` | EPG completo |
| `GET /api/epg/:channelId` | Programação de um canal |
| `GET /api/channels/:channelId` | Detalhe do canal + EPG + relacionados |
| `GET /api/events/:slug` | Detalhe do evento |
| `GET /api/home` | Painel agregado da home |
| `GET /api/search?q=` | Busca agregada |
| `GET /api/status` | Saúde e idade dos caches |
| `GET /api/image?u=` | Proxy de imagens com whitelist de hosts |

Os caches usam TTL curto e revalidação em background, com fallback para dados antigos quando a fonte falha.

## Android

O app Android não precisa do servidor Node. Os assets do front-end são embutidos no APK e as chamadas `/api/*` são atendidas por um proxy Kotlin/OkHttp dentro do próprio app.

### Como o app funciona

- `WebViewAssetLoader` serve `app/src/main/assets/public/` em `https://appassets.androidplatform.net`, uma origem segura.
- `ApiProxy` intercepta `/api/channels`, `/api/events`, `/api/epg` e `/api/image`, aplica cache em disco e repassa as requisições para o embedtv.cc.
- O WebView usa user agent próprio (`NomadTVAndroid/1.0`) e mantém cookies de terceiros para os players.
- Fullscreen de vídeo usa `WebChromeClient` e imersão do sistema.
- O botão voltar é resolvido pelo histórico da SPA via `window.nomadBack()`.
- Links externos, compartilhamento e abertura do player em navegador usam uma ponte segura por `WebMessageListener`, restrita à origem do app.

### Compilar

Requisitos: JDK 17 e Android SDK 34 (Android Studio, CodeAssist ou linha de comando).

```bash
./gradlew assembleDebug
```

APK gerado em:

```text
app/build/outputs/apk/debug/app-debug.apk
```

Os assets web ficam em `app/src/main/assets/public/` e são embutidos diretamente no APK. A versão web usa a mesma pasta, portanto não há etapa de cópia no build.

Para instalar em um aparelho conectado:

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

No Android Studio ou no CodeAssist, abra a **raiz do projeto** (a pasta que contém `settings.gradle.kts`) e execute o módulo `app`.

### GitHub Actions

O workflow `.github/workflows/android.yml` compila o APK de debug em cada push para `main`, pull request e execução manual. O artefato `NomadTV-debug` fica disponível na execução do workflow.

> Neste ambiente de desenvolvimento não há JDK/Android SDK instalados; a compilação do APK deve ser feita no Android Studio, em uma máquina com SDK ou pelo GitHub Actions.

### Distribuição

O APK de debug é assinado com a chave de debug e serve para testes e instalação direta. Para publicar, crie uma keystore de release, configure a assinatura no Gradle e gere um APK/AAB de release.

## Decisões técnicas

- **Sem cópia dos streams:** o player usa o iframe oficial do embedtv.cc, preservando autenticação, tokens e rotação de hosts.
- **Proxy no servidor e no app:** evita CORS nas APIs de dados e mantém o catálogo disponível mesmo com bloqueios de origem.
- **Dados derivados no cliente:** EPG atual/próximo, status dos eventos, busca e agrupamento são calculados localmente para responder rápido.
- **Cache em duas camadas:** TTL em memória no servidor; cache HTTP em disco no Android. As imagens têm cache longo.
- **Tratamento de dados instáveis:** programas antigos são ignorados, canais sem EPG continuam visíveis e hosts de imagem são validados por whitelist.
- **Cleartext habilitado no Android:** alguns players de terceiros ainda entregam mídia por HTTP; o tráfego de dados da Nomad TV continua em HTTPS. Se você for publicar em uma loja, revise essa política e restrinja domínios.

## Limitações

- A disponibilidade dos sinais depende inteiramente do embedtv.cc e dos provedores originais.
- A grade e os eventos podem estar desatualizados ou incompletos na fonte.
- Não há download offline, gravação ou login/perfis.
- O APK precisa ser compilado externamente neste ambiente.
- O app pode abrir links de terceiros no navegador externo quando um player não permite incorporação.

## Aviso

Este projeto é uma interface de organização de conteúdo. Não hospeda, retransmite nem distribui sinais de TV. Verifique a legalidade das fontes na sua jurisdição antes de usar ou redistribuir o aplicativo.
