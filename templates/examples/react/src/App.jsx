import { useState } from 'react';

export default function App() {
  const [count, setCount] = useState(0);

  return (
    <main>
      <h1>react-example OK</h1>
      <button onClick={() => setCount(count + 1)}>Clicks: {count}</button>
    </main>
  );
}
