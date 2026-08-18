import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api'

function App() {
  const [count, setCount] = useState(0)
  const [apiStatus, setApiStatus] = useState('checking')

  useEffect(() => {
    fetch(`${apiUrl}/health`)
      .then((response) => {
        if (!response.ok) {
          throw new Error('Health check failed')
        }

        setApiStatus('online')
      })
      .catch(() => {
        setApiStatus('offline')
      })
  }, [])

  return (
    <main className="grid min-h-screen place-content-center gap-4 p-8 text-center">
      <h1 className="text-3xl font-semibold">Amnostt</h1>

      <p className="text-muted-foreground">
        React application is running.
      </p>

      <p>API status: {apiStatus}</p>

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
