function LoadingState({ message = "Carregando informacoes..." }) {
  return (
    <div className="state-box loading-state">
      <span className="loading-dot" />
      {message}
    </div>
  );
}

export default LoadingState;
