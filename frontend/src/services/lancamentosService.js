import api from "./api";

export async function listarLancamentos(params = {}) {
  const { data } = await api.get("/lancamentos", { params });
  return data;
}

export async function obterLancamento(id) {
  const { data } = await api.get(`/lancamentos/${id}`);
  return data;
}

export async function criarLancamento(payload) {
  const { data } = await api.post("/lancamentos", payload);
  return data;
}

export async function atualizarLancamento(id, payload) {
  const { data } = await api.put(`/lancamentos/${id}`, payload);
  return data;
}

export async function excluirLancamento(id) {
  await api.delete(`/lancamentos/${id}`);
}
