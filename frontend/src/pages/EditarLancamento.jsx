import { useParams } from "react-router-dom";

import LancamentoForm from "../components/LancamentoForm.jsx";
import PageHeader from "../components/PageHeader.jsx";

function EditarLancamento() {
  const { id } = useParams();

  return (
    <section className="page">
      <PageHeader
        title="Editar lancamento"
        description="Atualize os dados da receita ou despesa selecionada."
      />

      <LancamentoForm lancamentoId={id} />
    </section>
  );
}

export default EditarLancamento;
