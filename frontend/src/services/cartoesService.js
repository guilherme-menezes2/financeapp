import api from "./api";

export async function listarCartoes() {
  const { data } = await api.get("/cartoes");
  return data;
}

export async function criarCartao(payload) {
  const { data } = await api.post("/cartoes", payload);
  return data;
}

export async function atualizarCartao(id, payload) {
  const { data } = await api.put(`/cartoes/${id}`, payload);
  return data;
}

export async function excluirCartao(id) {
  await api.delete(`/cartoes/${id}`);
}
