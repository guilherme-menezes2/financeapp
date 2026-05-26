export function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function formatarMesAno(mesAno) {
  if (!mesAno) {
    return "";
  }

  const [ano, mes] = mesAno.split("-");
  const data = new Date(Number(ano), Number(mes) - 1, 1);

  return data.toLocaleDateString("pt-BR", {
    month: "short",
    year: "2-digit",
  });
}

export function formatarData(dataIso) {
  if (!dataIso) {
    return "";
  }

  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}
