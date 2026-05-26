export function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function formatarMoedaPrecisa(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 3,
    maximumFractionDigits: 6,
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

export function formatarDataHora(dataIso) {
  if (!dataIso) {
    return "";
  }

  return new Date(dataIso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatarPercentual(valor) {
  return `${Number(valor || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}
