import { useState } from "react";

export function Login({ onSubmit }: { onSubmit(passcode: string): Promise<boolean> }) {
  const [pass, setPass] = useState("");
  return (
    <form
      id="login"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!(await onSubmit(pass))) setPass("");
      }}
    >
      <label htmlFor="pass" className="label">
        PASSCODE
      </label>
      <input
        id="pass"
        type="password"
        enterKeyHint="go"
        autoComplete="current-password"
        autoFocus
        value={pass}
        onChange={(e) => setPass(e.target.value)}
      />
    </form>
  );
}
