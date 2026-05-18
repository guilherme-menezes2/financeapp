import api from "./api";

export async function listarCategorias(params = {}) {
  const { data } = await api.get("/categorias", { params });
  return data;
}

export async function criarCategoria(payload) {
  const { data } = await api.post("/categorias", payload);
  return data;
}

export async function atualizarCategoria(id, payload) {
  const { data } = await api.put(`/categorias/${id}`, payload);
  return data;
}

export async function excluirCategoria(id) {
  await api.delete(`/categorias/${id}`);
}
