import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

export default function App() {
  const [pin, setPin] = useState('')
  const [user, setUser] = useState(null)
  const [error, setError] = useState('')
  const [stats, setStats] = useState(null)

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('pin', pin)
      .single()
    
    if (error || !data) {
      setError('Nieprawidłowy PIN')
    } else {
      setUser(data)
      if (data.role === 'teen') {
        fetchStats(data.id)
      }
    }
  }

  const fetchStats = async (userId) => {
    const { data } = await supabase
      .from('current_month_stats')
      .select('*')
      .eq('teen_id', userId)
      .single()
    if (data) setStats(data)
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <h1 className="text-2xl font-bold mb-6">Wspólny Dom</h1>
        <form onSubmit={handleLogin} className="flex flex-col gap-4 w-full max-w-xs">
          <input 
            type="password" 
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="Podaj 4-cyfrowy PIN" 
            className="border p-3 rounded text-center text-xl"
          />
          <button type="submit" className="bg-blue-600 text-white p-3 rounded font-bold">
            Zaloguj
          </button>
          {error && <p className="text-red-500 text-center">{error}</p>}
        </form>
      </div>
    )
  }

  if (user.role === 'parent') {
    return (
      <div className="p-4">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-xl font-bold">Panel Rodzica</h1>
          <button onClick={() => setUser(null)} className="text-sm text-gray-500">Wyloguj</button>
        </div>
        <p>Zalogowano jako: {user.name}</p>
        <div className="mt-6 p-4 bg-white rounded shadow text-sm text-gray-600">
          Miejsce na listę zadań do akceptacji oraz formularz dodawania zadań.
        </div>
      </div>
    )
  }

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-bold">Cześć, {user.name}</h1>
        <button onClick={() => setUser(null)} className="text-sm text-gray-500">Wyloguj</button>
      </div>
      
      {stats && (
        <div className="bg-white p-4 rounded shadow mb-6">
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide">Twój postęp (Ten miesiąc)</h2>
          <div className="mt-2 text-3xl font-bold">
            {stats.success_rate}%
          </div>
          <p className="text-xs text-gray-400 mt-1">Punkty zdobyte: {stats.earned_points} / Dostępne: {stats.max_points_to_date}</p>
          
          <div className="w-full bg-gray-200 rounded-full h-2.5 mt-4">
            <div 
              className={`h-2.5 rounded-full ${stats.success_rate > 90 ? 'bg-green-500' : 'bg-orange-500'}`} 
              style={{ width: `${Math.min(stats.success_rate, 100)}%` }}
            ></div>
          </div>
          <p className="text-xs mt-2 text-right">Cel premii: >90%</p>
        </div>
      )}

      <div className="bg-white p-4 rounded shadow text-sm text-gray-600">
        Miejsce na listę zadań oraz zlecenia z giełdy.
      </div>
    </div>
  )
}