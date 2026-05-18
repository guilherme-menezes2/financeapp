function ErrorState({ message = "Nao foi possivel carregar os dados." }) {
  return <div className="state-box error">{message}</div>;
}

export default ErrorState;
