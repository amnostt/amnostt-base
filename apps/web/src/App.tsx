import { useState } from 'react'
import './App.css'

function App() {
  const [count, setCount] = useState(0)

  return (
    <main>
      <h1>Amnostt</h1>
      <p>React application is running.</p>
      <button type="button" onClick={() => setCount((value) => value + 1)}>
        Count: {count}
      </button>
    </main>
  )
}

export default App
