import { app } from 'electron';

app.whenReady().then(async () => {
  try {
    const { getExplorerSelection, disposeExplorerSelection } = await import('../dist-electron/quick-preview-window.js');
    const start = performance.now();
    const selection = await getExplorerSelection();
    console.log(JSON.stringify({ selected: !!selection, elapsedMs: Math.round(performance.now() - start) }));
    const warmStart = performance.now();
    const warmSelection = await getExplorerSelection();
    console.log(JSON.stringify({ warmSelected: !!warmSelection, elapsedMs: Math.round(performance.now() - warmStart) }));
    disposeExplorerSelection();
    app.exit(selection && warmSelection ? 0 : 2);
  } catch (error) { console.error(error); app.exit(1); }
});
