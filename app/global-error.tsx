"use client";

// Last-resort page when the root layout itself fails. Plain styles, no app CSS.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100dvh", margin: 0, background: "#f5f8ff", color: "#0b1530" }}>
        <main style={{ textAlign: "center", padding: 24, maxWidth: 420 }}>
          <h1 style={{ fontSize: 22 }}>Seemple is having trouble</h1>
          <p style={{ color: "#5b6785" }}>Your screens keep playing. Try again in a moment.{error.digest ? ` Code: ${error.digest}` : ""}</p>
          <button type="button" onClick={reset} style={{ background: "#0066FF", color: "#fff", border: 0, borderRadius: 10, padding: "10px 18px", fontSize: 15 }}>Try again</button>
        </main>
      </body>
    </html>
  );
}
