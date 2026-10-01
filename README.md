# EKT Mix Review

Versão online do app de revisão de mixes do EKT. Toca as mixes direto do servidor (MP3), funciona no celular e guarda as notas num banco compartilhado. Ninguém precisa baixar zip nem exportar JSON.

## Como funciona

- **Acesso:** link com o código da banda (`/?k=CODIGO`). Na primeira vez a pessoa escolhe quem é (Niper, Rapha, Xris, Theo, Emmily, Estevam).
- **Notas:** dar pause abre o campo de nota já no ponto em que a música parou (no celular o teclado abre junto). Tocar no campo enquanto a música toca também pausa e marca o ponto. "Salvar e continuar" salva e volta a tocar. Os botões −5s/−2s/+2s ajustam o ponto. Arrastar na waveform marca um trecho (IN/OUT).
- **Notas dos outros** aparecem sozinhas a cada 15 s. Qualquer um marca uma nota como resolvida (✓); só o autor edita ou exclui.
- **Enviar mixes** (menu ⋯, no computador): escolhe os WAVs, o navegador converte para MP3 192 kbps, desenha a waveform e sobe. Título e versão saem do nome do arquivo, como no app original (`Musica RC MIX 3.wav`).
- **Exportar** (menu ⋯): planilha CSV ou JSON com todas as notas, e "copiar notas desta música" para colar no WhatsApp.

## Infra

- Front: Vite, sem framework. Deploy no Vercel sem configuração (build `npm run build`, saída `dist`).
- Banco: Supabase do Bandmade (projeto BMOS), schema `mixreview`, isolado do produto. As tabelas não ficam expostas. Tudo passa por funções `public.mixreview_*`, que exigem o código da banda.
- Áudio: bucket público `ekt-mix-review` (MP3 com nome aleatório). O upload só aceita MP3 com nome UUID, até 50 MB.
- A chave do Supabase em `src/config.js` é a publicável (pública por natureza). Dá para sobrescrever com `VITE_SUPABASE_URL` e `VITE_SUPABASE_KEY`.

## Rodar local

```
npm install
npm run dev
```
