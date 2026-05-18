import api from "./api";

export async function buscarResumo(params = {}) {
  const { data } = await api.get("/resumo", { params });
  return data;
}
