import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { CheckCircle, Clock, Copy, Plus, Star, Trash2 } from 'lucide-react'

export default function App() {
  const [pin, setPin] = useState('')
  const [user, setUser] = useState(null)
  const [error, setError] = useState('')
  
  // Dane współdzielone
  const [teens, setTeens] = useState([])
  const [stats, setStats] = useState(null)
  const [tasks, setTasks] = useState([])
  const [bounties, setBounties] = useState([])
  
  // Formularze
  const [newTask, setNewTask] = useState({ title: '', weight: 1, assignee_id: '', due_date: '' })
  const [newBounty, setNewBounty] = useState({ title: '', reward_amount: '', expires_at: '' })

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    const { data, error } = await supabase.from('profiles').select('*').eq('pin', pin).single()
    
    if (error || !data) {
      setError('Nieprawidłowy PIN')
    } else {
      setUser(data)
      fetchData(data)
    }
  }

  const fetchData = async (currentUser) => {
    // Pobranie listy nastolatków dla rodzica
    const { data: teensData } = await supabase.from('profiles').select('*').eq('role', 'teen')
    setTeens(teensData || [])

    if (currentUser.role === 'teen') {
      const { data: statsData } = await supabase.from('current_month_stats').select('*').eq('teen_id', currentUser.id).single()
      if (statsData) setStats(statsData)
      
      const { data: tasksData } = await supabase.from('monthly_tasks')
        .select('*')
        .eq('assignee_id', currentUser.id)
        .order('due_date', { ascending: true })
      setTasks(tasksData || [])
    } else {
      // Pobranie zadań do akceptacji dla rodzica
      const { data: tasksData } = await supabase.from('monthly_tasks')
        .select('*, profiles(name)')
        .eq('status', 'waiting_approval')
        .order('due_date', { ascending: false })
      setTasks(tasksData || [])
    }

    // Pobranie otwartych bounties
    const { data: bountiesData } = await supabase.from('bounty_tasks').select('*').eq('status', 'open')
    setBounties(bountiesData || [])
  }

  // --- AKCJE RODZICA ---

  const addTask = async (e) => {
    e.preventDefault()
    await supabase.from('monthly_tasks').insert([newTask])
    setNewTask({ title: '', weight: 1, assignee_id: teens[0]?.id || '', due_date: '' })
    alert('Zadanie dodane')
  }

  const addBounty = async (e) => {
    e.preventDefault()
    await supabase.from('bounty_tasks').insert([newBounty])
    setNewBounty({ title: '', reward_amount: '', expires_at: '' })
    fetchData(user)
  }

  const approveTask = async (taskId) => {
    await supabase.from('monthly_tasks').update({ status: 'approved' }).eq('id', taskId)
    fetchData(user)
  }

  const copyMonthPlan = async () => {
    const confirmCopy = window.confirm('Czy na pewno chcesz skopiować wszystkie zadania z obecnego miesiąca na kolejny?')
    if (!confirmCopy) return

    // Pobieramy zadania z obecnego miesiąca
    const date = new Date()
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1).toISOString()
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString()

    const { data: currentTasks } = await supabase.from('monthly_tasks')
      .select('*')
      .gte('due_date', firstDay)
      .lte('due_date', lastDay)

    if (!currentTasks || currentTasks.length === 0) {
      alert('Brak zadań w tym miesiącu do skopiowania.')
      return
    }

    // Przesuwamy datę o 1 miesiąc do przodu
    const newTasks = currentTasks.map(t => {
      const oldDate = new Date(t.due_date)
      const newDate = new Date(oldDate.setMonth(oldDate.getMonth() + 1))
      return {
        assignee_id: t.assignee_id,
        title: t.title,
        weight: t.weight,
        due_date: newDate.toISOString(),
        status: 'pending'
      }
    })

    await supabase.from('monthly_tasks').insert(newTasks)
    alert(`Skopiowano ${newTasks.length} zadań na kolejny miesiąc.`)
  }

  // --- AKCJE NASTOLATKA ---

  const markTaskDone = async (taskId) => {
    await supabase.from('monthly_tasks').update({ 
      status: 'waiting_approval', 
      completed_at: new Date().toISOString() 
    }).eq('id', taskId)
    fetchData(user)
  }

  const claimBounty = async (bountyId) => {
    await supabase.from('bounty_tasks').update({ 
      status: 'claimed', 
      claimed_by: user.id 
    }).eq('id', bountyId)
    fetchData(user)
  }

  // --- RENDEROWANIE ---

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
        <h1 className="text-3xl font-bold mb-8 text-blue-600">Wspólny Dom</h1>
        <form onSubmit={handleLogin} className="flex flex-col gap-4 w-full max-w-xs bg-white p-6 rounded-lg shadow-sm">
          <input 
            type="password" 
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="Wpisz PIN" 
            className="border p-3 rounded text-center text-2xl tracking-[1em]"
          />
          <button type="submit" className="bg-blue-600 text-white p-3 rounded font-bold hover:bg-blue-700">
            Wejdź
          </button>
          {error && <p className="text-red-500 text-center text-sm">{error}</p>}
        </form>
      </div>
    )
  }

  if (user.role === 'parent') {
    return (
      <div className="p-4 max-w-md mx-auto pb-20">
        <div className="flex justify-between items-center mb-6 border-b pb-4">
          <h1 className="text-xl font-bold">Panel Rodzica</h1>
          <button onClick={() => setUser(null)} className="text-sm text-gray-500 border px-3 py-1 rounded">Wyloguj</button>
        </div>

        {/* Sekcja: Akceptacje */}
        <section className="mb-8">
          <h2 className="font-bold text-gray-700 mb-3 flex items-center gap-2"><CheckCircle size={18}/> Do akceptacji</h2>
          {tasks.length === 0 ? <p className="text-sm text-gray-400">Brak zadań oczekujących na sprawdzenie.</p> : null}
          <div className="flex flex-col gap-2">
            {tasks.map(t => (
              <div key={t.id} className="bg-white p-3 rounded shadow-sm border-l-4 border-yellow-400 flex justify-between items-center">
                <div>
                  <p className="font-bold text-sm">{t.title}</p>
                  <p className="text-xs text-gray-500">Wykonał(a): {t.profiles.name}</p>
                </div>
                <button onClick={() => approveTask(t.id)} className="bg-green-500 text-white px-3 py-1 rounded text-sm font-bold">
                  Zatwierdź
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Sekcja: Dodawanie zadań */}
        <section className="mb-8 bg-white p-4 rounded shadow-sm">
          <h2 className="font-bold text-gray-700 mb-3 flex items-center gap-2"><Plus size={18}/> Zaplanuj zadanie (100%)</h2>
          <form onSubmit={addTask} className="flex flex-col gap-3">
            <input required placeholder="Nazwa np. Zmywarka" value={newTask.title} onChange={e => setNewTask({...newTask, title: e.target.value})} className="border p-2 rounded text-sm"/>
            <div className="flex gap-2">
              <select required value={newTask.assignee_id} onChange={e => setNewTask({...newTask, assignee_id: e.target.value})} className="border p-2 rounded text-sm flex-1">
                <option value="">Wybierz osobę...</option>
                {teens.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <select value={newTask.weight} onChange={e => setNewTask({...newTask, weight: parseInt(e.target.value)})} className="border p-2 rounded text-sm w-24">
                <option value="1">1 pkt</option>
                <option value="2">2 pkt</option>
                <option value="3">3 pkt</option>
              </select>
            </div>
            <input required type="datetime-local" value={newTask.due_date} onChange={e => setNewTask({...newTask, due_date: e.target.value})} className="border p-2 rounded text-sm"/>
            <button type="submit" className="bg-blue-600 text-white p-2 rounded text-sm font-bold mt-1">Dodaj zadanie</button>
          </form>
          
          <div className="mt-4 pt-4 border-t">
            <button onClick={copyMonthPlan} className="w-full flex items-center justify-center gap-2 bg-gray-100 text-gray-700 p-2 rounded text-sm font-bold hover:bg-gray-200">
              <Copy size={16} /> Skopiuj plan na kolejny miesiąc
            </button>
            <p className="text-xs text-gray-400 mt-2 text-center">Tworzy kopie wszystkich zadań z obecnego miesiąca z datą +1 miesiąc.</p>
          </div>
        </section>

        {/* Sekcja: Dodawanie Bounty */}
        <section className="bg-white p-4 rounded shadow-sm">
          <h2 className="font-bold text-gray-700 mb-3 flex items-center gap-2"><Star size={18} className="text-yellow-500"/> Wystaw zlecenie ekstra</h2>
          <form onSubmit={addBounty} className="flex flex-col gap-3">
            <input required placeholder="np. Umycie auta" value={newBounty.title} onChange={e => setNewBounty({...newBounty, title: e.target.value})} className="border p-2 rounded text-sm"/>
            <div className="flex gap-2">
              <input required type="number" placeholder="Kwota (PLN)" value={newBounty.reward_amount} onChange={e => setNewBounty({...newBounty, reward_amount: e.target.value})} className="border p-2 rounded text-sm flex-1"/>
              <input required type="datetime-local" value={newBounty.expires_at} onChange={e => setNewBounty({...newBounty, expires_at: e.target.value})} className="border p-2 rounded text-sm flex-1"/>
            </div>
            <button type="submit" className="bg-yellow-500 text-white p-2 rounded text-sm font-bold mt-1">Wrzuć na giełdę</button>
          </form>
        </section>
      </div>
    )
  }

  // Widok Nastolatka
  return (
    <div className="p-4 max-w-md mx-auto pb-20">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-bold">Cześć, {user.name}</h1>
        <button onClick={() => setUser(null)} className="text-sm text-gray-500 border px-3 py-1 rounded">Wyloguj</button>
      </div>
      
      {stats && (
        <div className="bg-white p-5 rounded-lg shadow-sm mb-6 border">
          <div className="flex justify-between items-end mb-2">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide">Skuteczność (Bieżąca)</h2>
            <div className="text-3xl font-bold text-gray-800">{stats.success_rate}%</div>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-3">
            <div 
              className={`h-3 rounded-full transition-all duration-500 ${stats.success_rate >= 90 ? 'bg-green-500' : 'bg-orange-400'}`} 
              style={{ width: `${Math.min(stats.success_rate, 100)}%` }}
            ></div>
          </div>
          <p className="text-xs text-gray-400 mt-3 flex justify-between">
            <span>Punkty: {stats.earned_points} / {stats.max_points_to_date}</span>
            <span>Cel premii: >90%</span>
          </p>
        </div>
      )}

      <section className="mb-8">
        <h2 className="font-bold text-gray-700 mb-3">Twoje zadania</h2>
        <div className="flex flex-col gap-2">
          {tasks.filter(t => t.status === 'pending').map(t => (
            <div key={t.id} className="bg-white p-4 rounded shadow-sm flex justify-between items-center">
              <div>
                <p className="font-bold text-gray-800">{t.title}</p>
                <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                  <Clock size={12}/> Do: {new Date(t.due_date).toLocaleString('pl-PL', {day: '2-digit', month: '2-digit', hour: '2-digit', minute:'2-digit'})}
                </p>
              </div>
              <button 
                onClick={() => markTaskDone(t.id)} 
                className="w-10 h-10 rounded-full border-2 border-gray-300 flex items-center justify-center hover:bg-green-50 hover:border-green-500 hover:text-green-500 transition-colors"
              >
                <CheckCircle size={20} />
              </button>
            </div>
          ))}
          {tasks.filter(t => t.status === 'pending').length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4 bg-gray-100 rounded">Wszystko zrobione! 🎉</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="font-bold text-gray-700 mb-3 flex items-center gap-2"><Star size={18} className="text-yellow-500"/> Giełda (Dodatkowy hajs)</h2>
        <div className="flex flex-col gap-2">
          {bounties.map(b => (
            <div key={b.id} className="bg-gradient-to-r from-yellow-50 to-white p-4 rounded shadow-sm border border-yellow-100">
              <div className="flex justify-between items-start mb-2">
                <p className="font-bold text-gray-800">{b.title}</p>
                <span className="bg-yellow-400 text-white text-xs font-bold px-2 py-1 rounded">+{b.reward_amount} zł</span>
              </div>
              <p className="text-xs text-gray-500 mb-3">Ważne do: {new Date(b.expires_at).toLocaleString('pl-PL')}</p>
              <button onClick={() => claimBounty(b.id)} className="w-full bg-yellow-400 text-white text-sm font-bold py-2 rounded">
                Biorę to!
              </button>
            </div>
          ))}
          {bounties.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4 bg-white rounded border">Brak dostępnych zleceń ekstra.</p>
          )}
        </div>
      </section>
    </div>
  )
}
