import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

export default function App() {
  const [pin, setPin] = useState('')
  const [user, setUser] = useState(null)
  const [error, setError] = useState('')
  const [allStats, setAllStats] = useState([])
  const [tasks, setTasks] = useState([])
  
  // Stany formularza dodawania / edycji zadań bazowych
  const [title, setTitle] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [weight, setWeight] = useState(1)
  const [dueDate, setDueDate] = useState('')
  const [editingTaskId, setEditingTaskId] = useState(null)

  // Filtry w panelu rodzica
  const [filterTeen, setFilterTeen] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')

  // Zakładka w panelu nastolatka ('active' / 'history' / 'wallet')
  const [teenTab, setTeenTab] = useState('active')

  const [teens, setTeens] = useState([])

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
      fetchTeens()
      fetchTasks()
      if (data.role === 'teen') {
        fetchStats(data.id)
      } else {
        fetchAllStats()
      }
    }
  }

  const fetchTeens = async () => {
    const { data } = await supabase.from('profiles').select('*').eq('role', 'teen')
    if (data) {
      setTeens(data)
      if (data.length > 0 && !assigneeId) setAssigneeId(data[0].id)
    }
  }

  const fetchStats = async (userId) => {
    const { data } = await supabase.from('current_month_stats').select('*').eq('teen_id', userId).single()
    if (data) setAllStats([data])
  }

  const fetchAllStats = async () => {
    const { data } = await supabase.from('current_month_stats').select('*')
    if (data) setAllStats(data)
  }

  const fetchTasks = async () => {
    const { data } = await supabase.from('monthly_tasks').select('*, profiles(name)').order('due_date', { ascending: true })
    if (data) setTasks(data)
  }

  const handleSaveTask = async (e) => {
    e.preventDefault()
    if (!title || !assigneeId || !dueDate) return

    const formattedDate = new Date(dueDate).toISOString()

    if (editingTaskId) {
      await supabase.from('monthly_tasks').update({
        title,
        assignee_id: assigneeId,
        weight: parseInt(weight),
        due_date: formattedDate
      }).eq('id', editingTaskId)
      setEditingTaskId(null)
    } else {
      await supabase.from('monthly_tasks').insert([{
        title,
        assignee_id: assigneeId,
        weight: parseInt(weight),
        due_date: formattedDate,
        status: 'pending'
      }])
    }

    setTitle('')
    setDueDate('')
    setEditingTaskId(null)
    fetchTasks()
    fetchAllStats()
  }

  const handleEditClick = (task) => {
    setEditingTaskId(task.id)
    setTitle(task.title)
    setAssigneeId(task.assignee_id)
    setWeight(task.weight)
    const d = new Date(task.due_date)
    const localIso = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().slice(0, 16)
    setDueDate(localIso)
  }

  const handleDeleteTask = async (id) => {
    if (confirm('Na pewno usunąć zadanie?')) {
      await supabase.from('monthly_tasks').delete().eq('id', id)
      fetchTasks()
      fetchAllStats()
    }
  }

  const handleTeenAction = async (taskId, newStatus) => {
    await supabase.from('monthly_tasks').update({ status: newStatus, completed_at: newStatus === 'waiting_approval' ? new Date() : null }).eq('id', taskId)
    fetchTasks()
    if (user.role === 'teen') fetchStats(user.id)
  }

  const handleParentApproval = async (taskId, status) => {
    await supabase.from('monthly_tasks').update({ status }).eq('id', taskId)
    fetchTasks()
    fetchAllStats()
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gray-50">
        <h1 className="text-2xl font-bold mb-6 text-blue-600">Wspólny Dom</h1>
        <form onSubmit={handleLogin} className="flex flex-col gap-4 w-full max-w-xs bg-white p-6 rounded-xl shadow-md">
          <input 
            type="password" 
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="Podaj 4-cyfrowy PIN" 
            className="border p-3 rounded-lg text-center text-xl tracking-widest"
          />
          <button type="submit" className="bg-blue-600 text-white p-3 rounded-lg font-bold shadow hover:bg-blue-700">
            Zaloguj
          </button>
          {error && <p className="text-red-500 text-center text-sm">{error}</p>}
        </form>
      </div>
    )
  }

  // WIDOK RODZICA
  if (user.role === 'parent') {
    const pendingApprovalTasks = tasks.filter(t => t.status === 'waiting_approval')
    const filteredTasks = tasks.filter(t => {
      if (filterTeen !== 'all' && t.assignee_id !== filterTeen) return false
      if (filterStatus !== 'all' && t.status !== filterStatus) return false
      return true
    })

    return (
      <div className="p-4 max-w-md mx-auto pb-12">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-xl font-bold">Panel Rodzica</h1>
          <button onClick={() => setUser(null)} className="text-sm text-gray-500 bg-gray-200 px-3 py-1 rounded-full">Wyloguj</button>
        </div>

        {/* Kafelki postępu i finansów nastolatków */}
        <div className="flex flex-col gap-3 mb-6">
          {teens.map(teen => {
            const stat = allStats.find(s => s.teen_id === teen.id) || { success_rate: 100, earned_points: 0, max_points_to_date: 0 }
            const rateDecimal = stat.success_rate / 100
            const basePayout = teen.base_allowance * rateDecimal
            const bonusEarned = stat.success_rate > 90 ? teen.bonus_allowance : 0
            const totalEstimated = basePayout + bonusEarned

            return (
              <div key={teen.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center">
                <div>
                  <h2 className="font-bold text-gray-800 text-base">{teen.name}</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Skuteczność: <span className="font-semibold text-gray-700">{stat.success_rate}%</span></p>
                </div>
                <div className="text-right">
                  <div className="text-xl font-black text-blue-600">{totalEstimated.toFixed(0)} zł</div>
                  <p className="text-[10px] text-gray-400">Baza: {teen.base_allowance} zł {stat.success_rate > 90 ? '+ bonus' : ''}</p>
                </div>
              </div>
            )
          })}
        </div>

        {/* Sekcja do akceptacji */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6">
          <h2 className="font-bold text-gray-800 mb-3 flex items-center justify-between">
            <span>Do akceptacji</span>
            <span className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full">{pendingApprovalTasks.length}</span>
          </h2>
          {pendingApprovalTasks.length === 0 ? (
            <p className="text-xs text-gray-400">Brak zadań oczekujących na sprawdzenie.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {pendingApprovalTasks.map(task => (
                <div key={task.id} className="flex justify-between items-center bg-gray-50 p-3 rounded-lg border">
                  <div>
                    <p className="font-semibold text-sm">{task.title} <span className="text-xs text-gray-500 font-normal">({task.profiles?.name})</span></p>
                    <p className="text-xs text-gray-400">Waga: {task.weight} pkt</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleParentApproval(task.id, 'approved')} className="bg-green-600 text-white text-xs px-3 py-1.5 rounded font-bold">Zatwierdź</button>
                    <button onClick={() => handleParentApproval(task.id, 'failed')} className="bg-red-100 text-red-600 text-xs px-3 py-1.5 rounded font-bold">Odrzuć</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Formularz dodawania / edycji zadania */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6">
          <h2 className="font-bold text-gray-800 mb-3">{editingTaskId ? 'Edytuj zadanie' : '+ Zaplanuj zadanie (100%)'}</h2>
          <form onSubmit={handleSaveTask} className="flex flex-col gap-3">
            <input 
              type="text" 
              placeholder="Nazwa np. Wyprowadzenie psa" 
              value={title} 
              onChange={e => setTitle(e.target.value)} 
              className="border p-2.5 rounded-lg text-sm"
              required
            />
            <div className="grid grid-cols-2 gap-2">
              <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)} className="border p-2.5 rounded-lg text-sm bg-white">
                {teens.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <select value={weight} onChange={e => setWeight(e.target.value)} className="border p-2.5 rounded-lg text-sm bg-white">
                <option value="1">1 pkt (Pies)</option>
                <option value="2">2 pkt (Zmywarka)</option>
                <option value="3">3 pkt (Pokój)</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Termin ostateczny:</label>
              <input 
                type="datetime-local" 
                value={dueDate} 
                onChange={e => setDueDate(e.target.value)} 
                className="border p-2.5 rounded-lg text-sm w-full"
                required
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" className="flex-1 bg-blue-600 text-white p-2.5 rounded-lg font-bold text-sm shadow">
                {editingTaskId ? 'Zapisz zmiany' : 'Dodaj do planu'}
              </button>
              {editingTaskId && (
                <button type="button" onClick={() => { setEditingTaskId(null); setTitle(''); setDueDate(''); }} className="bg-gray-200 text-gray-700 px-4 rounded-lg text-sm font-bold">
                  Anuluj
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Lista zadań z filtrami */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-bold text-gray-800">Zadania w miesiącu</h2>
            <span className="text-xs text-gray-400">Łącznie: {filteredTasks.length}</span>
          </div>

          <div className="flex gap-2 mb-4">
            <select value={filterTeen} onChange={e => setFilterTeen(e.target.value)} className="border p-1.5 rounded text-xs bg-gray-50 flex-1">
              <option value="all">Wszyscy</option>
              {teens.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="border p-1.5 rounded text-xs bg-gray-50 flex-1">
              <option value="all">Wszystkie statusy</option>
              <option value="pending">Oczekujące</option>
              <option value="waiting_approval">Do akceptacji</option>
              <option value="approved">Zatwierdzone</option>
              <option value="failed">Niewykonane</option>
            </select>
          </div>

          <div className="flex flex-col gap-3">
            {filteredTasks.map(task => {
              const dateFormatted = new Date(task.due_date).toLocaleString('pl-PL', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
              return (
                <div key={task.id} className="border p-3 rounded-xl flex justify-between items-center bg-white shadow-2xs">
                  <div>
                    <p className="font-semibold text-sm text-gray-800">{task.title} <span className="text-xs text-gray-500 font-normal">({task.profiles?.name})</span></p>
                    <p className="text-xs text-gray-400 mt-0.5">Termin: {dateFormatted} • {task.weight} pkt</p>
                    <span className={`inline-block mt-1.5 text-[10px] px-2 py-0.5 rounded-full font-bold ${
                      task.status === 'approved' ? 'bg-green-100 text-green-700' :
                      task.status === 'waiting_approval' ? 'bg-blue-100 text-blue-700' :
                      task.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {task.status === 'approved' ? 'Zatwierdzone' : task.status === 'waiting_approval' ? 'Czeka na akceptację' : task.status === 'failed' ? 'Niewykonane' : 'Do zrobienia'}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleEditClick(task)} className="text-gray-400 hover:text-blue-600 p-1 text-xs font-bold bg-gray-50 border px-2.5 py-1 rounded">Edytuj</button>
                    <button onClick={() => handleDeleteTask(task.id)} className="text-gray-400 hover:text-red-500 p-1 text-xs bg-gray-50 border px-2 py-1 rounded">🗑️</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // WIDOK NASTOLATKA
  const myTasks = tasks.filter(t => t.assignee_id === user.id)
  const activeTasks = myTasks.filter(t => t.status === 'pending')
  const historyTasks = myTasks.filter(t => t.status !== 'pending')
  const stats = allStats[0] || { success_rate: 100, earned_points: 0, max_points_to_date: 0 }

  // Finanse nastolatka
  const baseAllowance = user.base_allowance || 100
  const bonusAllowance = user.bonus_allowance || 30
  const rateDecimal = stats.success_rate / 100
  const currentBaseEarned = baseAllowance * rateDecimal
  const hasBonus = stats.success_rate > 90
  const totalEstimatedPayout = currentBaseEarned + (hasBonus ? bonusAllowance : 0)

  return (
    <div className="p-4 max-w-md mx-auto pb-12">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-bold">Cześć, {user.name}!</h1>
        <button onClick={() => setUser(null)} className="text-sm text-gray-500 bg-gray-200 px-3 py-1 rounded-full">Wyloguj</button>
      </div>
      
      {/* Finansowy kafel motywacyjny */}
      <div className="bg-gradient-to-br from-blue-600 to-blue-800 text-white p-5 rounded-2xl shadow-md mb-6">
        <h2 className="text-xs font-bold text-blue-200 uppercase tracking-wider">Prognoza wypłaty (Ten miesiąc)</h2>
        <div className="mt-2 text-4xl font-black">
          {totalEstimatedPayout.toFixed(0)} <span className="text-xl font-normal">zł</span>
        </div>
        <p className="text-xs text-blue-100 mt-1">
          Baza ({stats.success_rate}% z {baseAllowance} zł): {currentBaseEarned.toFixed(0)} zł 
          {hasBonus ? ` + Bonus (${bonusAllowance} zł)` : ' (brak bonusu < 90%)'}
        </p>

        <div className="w-full bg-blue-900/50 rounded-full h-2.5 mt-4 overflow-hidden">
          <div 
            className={`h-2.5 rounded-full transition-all duration-500 ${hasBonus ? 'bg-green-400' : 'bg-orange-400'}`} 
            style={{ width: `${Math.min(stats.success_rate, 100)}%` }}
          ></div>
        </div>
        <div className="flex justify-between text-[11px] text-blue-200 mt-1">
          <span>Skuteczność: {stats.success_rate}%</span>
          <span>Cel bonusu: &gt;90%</span>
        </div>
      </div>

      {/* Przełącznik widoków */}
      <div className="flex bg-gray-200 p-1 rounded-xl mb-4">
        <button 
          onClick={() => setTeenTab('active')} 
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${teenTab === 'active' ? 'bg-white shadow text-blue-600' : 'text-gray-600'}`}
        >
          Do zrobienia ({activeTasks.length})
        </button>
        <button 
          onClick={() => setTeenTab('history')} 
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${teenTab === 'history' ? 'bg-white shadow text-blue-600' : 'text-gray-600'}`}
        >
          Historia ({historyTasks.length})
        </button>
        <button 
          onClick={() => setTeenTab('wallet')} 
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${teenTab === 'wallet' ? 'bg-white shadow text-blue-600' : 'text-gray-600'}`}
        >
          Rozliczenia 💰
        </button>
      </div>

      {/* Widok w zależności od wybranej zakładki */}
      {teenTab === 'wallet' ? (
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
          <h2 className="font-bold text-gray-800 mb-3">Szczegóły rozliczenia finansowego</h2>
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex justify-between p-3 bg-gray-50 rounded-xl">
              <span className="text-gray-600">Baza miesięczna (maksymalna):</span>
              <span className="font-bold">{baseAllowance} zł</span>
            </div>
            <div className="flex justify-between p-3 bg-gray-50 rounded-xl">
              <span className="text-gray-600">Stopień realizacji bazy ({stats.success_rate}%):</span>
              <span className="font-bold text-blue-600">+{currentBaseEarned.toFixed(0)} zł</span>
            </div>
            <div className="flex justify-between p-3 bg-gray-50 rounded-xl">
              <span className="text-gray-600">Premia za wynik &gt; 90%:</span>
              <span className={`font-bold ${hasBonus ? 'text-green-600' : 'text-gray-400'}`}>
                {hasBonus ? `+${bonusAllowance} zł` : '0 zł (wymagane >90%)'}
              </span>
            </div>
            <div className="flex justify-between p-3 bg-gray-50 rounded-xl border-t border-gray-200">
              <span className="text-gray-600 font-semibold">Zadania ekstra (Ad-hoc):</span>
              <span className="font-bold text-gray-800">0 zł</span>
            </div>
            <div className="flex justify-between p-4 bg-blue-50 rounded-xl border border-blue-100 mt-2">
              <span className="font-bold text-blue-900">Łącznie do wypłaty:</span>
              <span className="font-black text-blue-600 text-lg">{totalEstimatedPayout.toFixed(0)} zł</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
          <h2 className="font-bold text-gray-800 mb-3">{teenTab === 'active' ? 'Zadania bieżące' : 'Historia wszystkich zadań'}</h2>
          <div className="flex flex-col gap-3">
            {teenTab === 'active' ? (
              activeTasks.length === 0 ? (
                <p className="text-xs text-gray-400 py-4 text-center">Brak bieżących zadań do zrobienia. Brawo! 🎉</p>
              ) : (
                activeTasks.map(task => {
                  const dateFormatted = new Date(task.due_date).toLocaleString('pl-PL', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
                  return (
                    <div key={task.id} className="border p-3.5 rounded-xl flex justify-between items-center bg-white shadow-2xs">
                      <div>
                        <p className="font-semibold text-sm text-gray-800">{task.title}</p>
                        <p className="text-xs text-gray-400 mt-0.5">Termin: {dateFormatted} • {task.weight} pkt</p>
                      </div>
                      <div>
                        <button 
                          onClick={() => handleTeenAction(task.id, 'waiting_approval')}
                          className="bg-blue-600 text-white text-xs px-4 py-2 rounded-lg font-bold shadow-sm"
                        >
                          Zrobione
                        </button>
                      </div>
                    </div>
                  )
                })
              )
            ) : (
              historyTasks.length === 0 ? (
                <p className="text-xs text-gray-400 py-4 text-center">Brak historii w tym miesiącu.</p>
              ) : (
                historyTasks.map(task => {
                  const dateFormatted = new Date(task.due_date).toLocaleString('pl-PL', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
                  return (
                    <div key={task.id} className="border p-3.5 rounded-xl flex justify-between items-center bg-gray-50 shadow-2xs">
                      <div>
                        <p className="font-semibold text-sm text-gray-800">{task.title}</p>
                        <p className="text-xs text-gray-400 mt-0.5">Termin: {dateFormatted} • {task.weight} pkt</p>
                      </div>
                      <div>
                        {task.status === 'waiting_approval' && (
                          <span className="text-xs text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg font-bold">Czeka</span>
                        )}
                        {task.status === 'approved' && (
                          <span className="text-xs text-green-600 bg-green-50 px-3 py-1.5 rounded-lg font-bold">Zatwierdzone ✅</span>
                        )}
                        {task.status === 'failed' && (
                          <span className="text-xs text-red-500 bg-red-50 px-3 py-1.5 rounded-lg font-bold">Przegapione ❌</span>
                        )}
                      </div>
                    </div>
                  )
                })
              )
            )}
          </div>
        </div>
      )}
    </div>
  )
}
