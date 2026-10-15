import { createArena } from './networking/server';
const arena = await createArena();
const port = Number(process.env.PORT ?? 3001);
arena.http.listen(port, '0.0.0.0', () =>
  console.log(`Tank Arena authoritative server listening on :${port}`),
);
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    void arena.close().then(() => process.exit(0));
  });
