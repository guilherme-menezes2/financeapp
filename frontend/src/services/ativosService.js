import api from "./api";

export async function listarAtivos() {
  const { data } = await api.get("/ativos");
  return data;
}

export async function obterResumoCarteira() {
  const { data } = await api.get("/ativos/resumo");
  return data;
}

export async function criarAtivo(payload) {
  const { data } = await api.post("/ativos", payload);
  return data;
}

export async function atualizarAtivo(id, payload) {
  const { data } = await api.put(`/ativos/${id}`, payload);
  return data;
}

export async function excluirAtivo(id) {
  await api.delete(`/ativos/${id}`);
}

export async function atualizarCotacaoAtivo(id) {
  const { data } = await api.post(`/ativos/${id}/atualizar`);
  return data;
}

export async function atualizarCotacoesAtivos() {
  const { data } = await api.post("/ativos/atualizar");
  return data;
}

export async function listarProventos() {
  const { data } = await api.get("/ativos/proventos");
  return data;
}

export async function atualizarProventosAtivos() {
  const { data } = await api.post("/ativos/proventos/atualizar");
  return data;
}

export async function listarSnapshotsCarteira() {
  const { data } = await api.get("/ativos/snapshots", {
    params: { limite: 90 },
  });
  return data;
}

export async function registrarSnapshotCarteira() {
  const { data } = await api.post("/ativos/snapshots");
  return data;
}

export async function listarMovimentacoesAtivo(ativoId) {
  const { data } = await api.get(`/ativos/${ativoId}/movimentacoes`);
  return data;
}

export async function criarMovimentacaoAtivo(ativoId, payload) {
  const { data } = await api.post(`/ativos/${ativoId}/movimentacoes`, payload);
  return data;
}

export async function excluirMovimentacaoAtivo(movimentacaoId) {
  await api.delete(`/ativos/movimentacoes/${movimentacaoId}`);
}
