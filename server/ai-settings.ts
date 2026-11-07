export function normalizeAIEndpoint(value: string): string {
  const url = new URL(value.trim());
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Invalid endpoint');
  url.pathname = url.pathname.replace(/\/+$/, '').replace(/\/chat\/completions$/, '') || '/v1';
  return url.toString().replace(/\/$/, '');
}

export function aiFailureMessage(error: unknown): string {
  const e = error as {status?: number; name?: string};
  if (e?.status === 401) return 'AIの認証に失敗しました。システム設定のAPIキーを確認してください。';
  if (e?.status === 403) return 'AIの利用権限がありません。APIキーとモデルの利用権限を確認してください。';
  if (e?.status === 404) return 'AIの接続先またはモデルが見つかりません。システム設定を確認してください。';
  if (e?.status === 429) return 'AIの利用上限または同時実行上限に達しました。利用枠を確認し、時間を置いて再試行してください。';
  if (e?.status === 400 || e?.status === 422) return 'AIが生成リクエストを受け付けませんでした。モデルとAPIの互換性を確認してください。';
  if (e?.name === 'APIConnectionTimeoutError' || e?.name === 'TimeoutError') return 'AIの応答がタイムアウトしました。問題数を減らすか、時間を置いて再試行してください。';
  return 'AIへの接続に失敗しました。接続先の稼働状況とシステム設定を確認してください。';
}
