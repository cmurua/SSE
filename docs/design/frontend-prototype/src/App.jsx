// Root app: route state + sermo state + login.
const App = () => {
  const [user, setUser] = React.useState(null);
  const [route, setRoute] = React.useState("home");
  const [sermo, setSermo] = React.useState(true);
  const [initialOp, setInitialOp] = React.useState(null);

  const onNav = (r) => {
    setInitialOp(null);
    setRoute(r);
    window.scrollTo({ top: 0 });
  };

  if (!user) return <window.Login onLogin={(u) => setUser({ ...window.USER, ...u })} />;

  return (
    <window.Shell user={user} route={route} onNav={onNav} sermo={sermo} setSermo={setSermo} onLogout={() => setUser(null)}>
      {route === "home"        && <window.Home onNav={onNav} sermo={sermo} />}
      {route === "realtime"    && <window.Realtime sermo={sermo} onNav={onNav} />}
      {route === "histories"   && <window.Histories initialOp={initialOp} onNav={onNav} />}
      {route === "suggestions" && <window.Suggestions />}
      {route === "help"        && <window.Help />}
      {route === "about"       && <window.About />}
    </window.Shell>
  );
};

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
