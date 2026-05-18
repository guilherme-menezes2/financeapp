import LancamentoForm from "../components/LancamentoForm.jsx";
import PageHeader from "../components/PageHeader.jsx";

function NovoLancamento() {
  return (
    <section className="page">
      <PageHeader
        title="Novo lancamento"
        description="Cadastre uma receita ou despesa."
      />

      <LancamentoForm />
    </section>
  );
}

export default NovoLancamento;
