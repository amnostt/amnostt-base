import { useState } from 'react'
import { Button } from '@/components/ui/button'

function App() {
  const [count, setCount] = useState(0)

  return (
    <main className="grid min-h-screen place-content-center gap-4 p-8 text-center">
      <h1 className="text-3xl font-semibold">Amnostt</h1>
      <p className="text-muted-foreground">
        React application is running.
      </p>
      <Button
        type="button"
        onClick={() => setCount((value) => value + 1)}
      >
        Count: {count}
      </Button>
    </main>
  )
}

export default App
