import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

// Słownik predefiniowanych zadań z godzinami i wagą
const TEMPLATES = {
  dog_morning: { title: 'Spacer z psem (rano)', weight: 1, startHour: 7, dueHour: 9 },
  dog_afternoon: { title: 'Spacer z psem (popołudnie)', weight: 1, startHour: 14, dueHour: 16 },
  dog_evening: { title: 'Spacer z psem (wieczór)', weight: 1, startHour: 20, dueHour: 22 },
  dishwasher: { title: 'Opróżnianie zmywarki', weight: 2, startHour: 10, dueHour: 20 },
  room: { title: 'Sprzątanie pokoju', weight: 3, startHour: 10, dueHour: 20 },
  custom: { title: '--- Własne zadanie ---', weight: 1 }
}

export default function App() {
  const [pin, setPin] = useState('')
  const [user, setUser] = useState(null)
  const [error, setError] = useState('')
  const [allStats, setAllStats] = useState([])
  const [tasks, setTasks] = useState([])
  const [teens, setTeens] = useState([])
  const [budgets, setBudgets] = useState({})

  // Stany formularza zadań
  const [taskTemplate, setTaskTemplate] = useState('dog_morning')
  const [assigneeId, setAssigneeId] = useState('')
  const [selectedDays, setSelectedDays] = useState([]) 
  
  // Pola dla zadania własnego (Custom) / Edycji
  const [customTitle, setCustomTitle] = useState('')
  const [customWeight, setCustomWeight] = useState(1)
  const [startDate, setStartDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [editingTaskId, setEditingTaskId] = useState(null)

  // Zakładki i filtry
  const [filterTeen, setFilterTeen] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [teenTab, setTeenTab] = useState('active')

  // Stan powiadomień (Toast)
  const [toastMessage, setToastMessage] = useState('')

  // Pomocnicze do kalendarza
  const year = new Date().getFullYear()
  const month = new Date().getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  // Funkcja wywołująca powiadomienie znikające po 3 sekundach
  const showToast = (msg) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(''), 3000)
  }

  const toLocalIsoString = (isoString) => {
    if (!isoString) return '';
    const d = new Date(isoString);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  const formatTaskTime = (startStr, dueStr) => {
    const due = new Date(dueStr);
    const dueFormatted = due.toLocaleString('pl-PL', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    if (!startStr) return `Termin: ${dueFormatted}`;
    
    const start = new Date(startStr);
    if (start.getDate() === due.getDate() && start.getMonth() === due.getMonth()) {
       return `${start.toLocaleString('pl-PL', { month: '2-digit', day: '2-digit' })}, ${start.toLocaleString('pl-PL', { hour: '2-digit', minute: '2-digit' })} - ${due.toLocaleString('pl-PL', { hour: '2-digit', minute: '2-digit' })}`;
    }
    return `Od: ${start.toLocaleString('pl-PL', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })} Do: ${dueFormatted}`;
  }

  const formatFutureTime = (dateStr) => {
    const d = new Date(dateStr);
    const today = new Date();
    if (d.getDate() === today.getDate() && d.getMonth() === today.getMonth()) {
        return `dzisiaj o ${d.toLocaleString('pl-PL', { hour: '2-digit', minute: '2-digit' })}`;
    }
    return `${d.toLocaleString('pl-PL', { day: '2-digit', month: '2-digit' })} o ${d.toLocaleString('pl-PL', { hour: '2-digit', minute: '2-digit' })}`;
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    const { data, error } = await supabase.from('profiles').select('*').eq('pin', pin).single()
    if (error || !data) {
      setError('Nieprawidłowy PIN')
    } else {
      setUser(data)
      fetchTeens()
      fetchTasks()
      if (data.role === 'teen') fetchStats(data.id)
      else fetchAllStats()
    }
  }

  const fetchTeens = async () => {
    const { data } = await supabase.from('profiles').select('*').eq('role', 'teen')
    if (data) {
      setTeens(data)
      if (data.length > 0 && !assigneeId) setAssigneeId(data[0].id)
      const budgetMap = {}
      data.forEach(t => budgetMap[t.id] = { base: t.base_allowance, bonus: t.bonus_allowance })
      setBudgets(budgetMap)
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
    
    if (editingTaskId || taskTemplate === 'custom') {
      if (!customTitle || !dueDate) return alert('Wypełnij nazwę i termin końcowy.')
      const payload = {
        title: customTitle,
        assignee_id: assigneeId,
        weight: parseInt(customWeight),
        start_date: startDate ? new Date(startDate).toISOString() : null,
        due_date: new Date(dueDate).toISOString()
      }

      if (editingTaskId) {
        await supabase.from('monthly_tasks').update(payload).eq('id', editingTaskId)
      } else {
        payload.status = 'pending'
        await supabase.from('monthly_tasks').insert([payload])
      }
    } 
    else {
      if (selectedDays.length === 0) return alert('Zaznacz przynajmniej jeden dzień w miesiącu.')
      const t = TEMPLATES[taskTemplate]
      
      const inserts = selectedDays.map(day => {
        const start = new Date(year, month, day, t.startHour, 0, 0).toISOString()
        const due = new Date(year, month, day, t.dueHour, 0, 0).toISOString()
        return {
          title: t.title,
          assignee_id: assigneeId,
          weight: t.weight,
          start_date: start,
          due_date: due,
          status: 'pending'
        }
      })
      await supabase.from('monthly_tasks').insert(inserts)
    }

    resetForm()
    fetchTasks()
    fetchAllStats()
    showToast('Plan zadań zapisany! ✅')
  }

  const resetForm = () => {
    setTaskTemplate('dog_morning')
    setCustomTitle('')
    setStartDate('')
    setDueDate('')
    setEditingTaskId(null)
    setSelectedDays([])
  }

  const handleEditClick = (task) => {
    setEditingTaskId(task.id)
    setTaskTemplate('custom') 
    setCustomTitle(task.title)
    setAssigneeId(task.assignee_id)
    setCustomWeight(task.weight)
    setStartDate(toLocalIsoString(task.start_date))
    setDueDate(toLocalIsoString(task.due_date))
  }

  const handleDeleteTask = async (id) => {
    if (confirm('Na pewno usunąć zadanie?')) {
      await supabase.from('monthly_tasks').delete().eq('id', id)
      fetchTasks()
      fetchAllStats()
    }
  }

  const toggleDay = (day) => {
    setSelectedDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day])
  }

  const selectAllDays = () => setSelectedDays([...daysArray])
  const selectWeekdays = () => {
    const weekdays = daysArray.filter(day => {
      const d = new Date(year, month, day).getDay()
      return d !== 0 && d !== 6 
    })
    setSelectedDays(weekdays)
  }

  const handleTeenAction = async (taskId, newStatus) => {
    await supabase.from('monthly_tasks').update({ status: newStatus, completed_at: newStatus === 'waiting_approval' ? new Date() : null }).eq('id', taskId)
    fetchTasks()
    if (user.role === 'teen') fetchStats(user.id)
    if (newStatus === 'waiting_approval') showToast('Zadanie przekazane do akceptacji! 🎉')
  }

  const handleParentApproval = async (taskId, status) => {
    await supabase.from('monthly_tasks').update({ status }).eq('id', taskId)
    fetchTasks()
    fetchAllStats()
  }

  const handleBudgetChange = (teenId, field, value) => {
    setBudgets(prev => ({ ...prev, [teenId]: { ...prev[teenId], [field]: value } }))
  }

  const handleSaveBudgets = async () => {
    for (const teenId of Object.keys(budgets)) {
      await supabase.from('profiles').update({
        base_allowance: parseFloat(budgets[teenId].base) || 0,
        bonus_allowance: parseFloat(budgets[teenId].bonus) || 0
      }).eq('id', teenId)
    }
    showToast('Budżety zostały zaktualizowane! 💰')
    fetchTeens()
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gray-50">
        <h1 className="text-2xl font-bold mb-6 text-blue-600">Wspólny Dom</h1>
        <form onSubmit={handleLogin} className="flex flex-col gap-4 w-full max-w-xs bg-white p-6 rounded-xl shadow-md">
          <input 
            type="password" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value)}
            placeholder="Podaj 4-cyfrowy PIN" className="border p-3 rounded-lg text-center text-xl tracking-widest"
          />
          <button type="submit" className="bg-blue-600 text-white p-3 rounded-lg font-bold shadow hover:bg-blue-700 active:scale-95 transition-transform">Zaloguj</button>
          {error && <p className="text-red-500 text-center text-sm">{error}</p>}
        </form>
      </div>
    )
  }

  return (
    <div className="p-4 max-w-md mx-auto pb-12 relative">
    {/* Element Powiadomienia (Toast) */}
      {toastMessage && (
        <div className="fixed top-6 left-1/2 transform -translate-x-1/2 z-50 bg-gray-900 text-white px-5 py-3 rounded-full shadow-2xl text-sm font-bold animate-bounce whitespace-nowrap">
          {toastMessage}
        </div>
      )}

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-bold">{user.role === 'parent' ? 'Panel Rodzica' : `Cześć, ${user.name}!`}</h1>
        <button onClick={() => setUser(null)} className="text-sm text-gray-500 bg-gray-200 px-3 py-1 rounded-full active:bg-gray-300">Wyloguj</button>
      </div>

      {user.role === 'parent' ? (
        // --- WIDOK RODZICA ---
        <>
          {/* Kafelki postępu nastolatków */}
          <div className="flex flex-col gap-3 mb-6">
            {teens.map(teen => {
              const stat = allStats.find(s => s.teen_id === teen.id) || { success_rate: 100, earned_points: 0, max_points_to_date: 0 }
              const rateDecimal = stat.success_rate / 100
              const totalEstimated = (teen.base_allowance * rateDecimal) + (stat.success_rate > 90 ? teen.bonus_allowance : 0)
              return (
                <div key={teen.id} className="bg-white p-4 rounded-xl shadow-sm border flex justify-between items-center">
                  <div>
                    <h2 className="font-bold text-gray-800">{teen.name}</h2>
                    <p className="text-xs text-gray-500">Skuteczność: <span className="font-bold">{stat.success_rate}%</span></p>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-black text-blue-600">{totalEstimated.toFixed(0)} zł</div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Sekcja ustawień budżetu */}
          <div className="bg-white p-4 rounded-xl shadow-sm border mb-6">
            <h2 className="font-bold text-gray-800 mb-3 text-sm">Ustawienia kieszonkowego</h2>
            <div className="flex flex-col gap-3">
              {teens.map(teen => (
                <div key={teen.id} className="bg-gray-50 p-3 rounded-lg border grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-gray-500">Baza (zł):</label>
                    <input type="number" value={budgets[teen.id]?.base ?? teen.base_allowance} onChange={e => handleBudgetChange(teen.id, 'base', e.target.value)} className="border p-2 rounded text-sm w-full" />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500">Bonus &gt;90%:</label>
                    <input type="number" value={budgets[teen.id]?.bonus ?? teen.bonus_allowance} onChange={e => handleBudgetChange(teen.id, 'bonus', e.target.value)} className="border p-2 rounded text-sm w-full" />
                  </div>
                </div>
              ))}
              <button onClick={handleSaveBudgets} className="bg-gray-800 text-white text-xs py-2 rounded-lg font-bold shadow active:scale-95 transition-transform">Zapisz budżety</button>
            </div>
          </div>

          {/* Formularz dodawania zadań */}
          <div className="bg-white p-4 rounded-xl shadow-sm border mb-6">
            <h2 className="font-bold text-gray-800 mb-3">{editingTaskId ? '✏️ Edytuj zadanie' : '⚡ Szybkie planowanie (100%)'}</h2>
            <form onSubmit={handleSaveTask} className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-2">
                <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)} className="border p-2.5 rounded-lg text-sm bg-white font-bold text-blue-700">
                  {teens.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <select disabled={editingTaskId} value={taskTemplate} onChange={e => setTaskTemplate(e.target.value)} className="border p-2.5 rounded-lg text-sm bg-gray-50">
                  {Object.keys(TEMPLATES).map(key => (
                    <option key={key} value={key}>{TEMPLATES[key].title}</option>
                  ))}
                </select>
              </div>

              {(taskTemplate === 'custom' || editingTaskId) && (
                <div className="bg-gray-50 p-3 rounded-xl border flex flex-col gap-3">
                  <input type="text" placeholder="Nazwa zadania" value={customTitle} onChange={e => setCustomTitle(e.target.value)} className="border p-2 rounded-lg text-sm" />
                  <select value={customWeight} onChange={e => setCustomWeight(e.target.value)} className="border p-2 rounded-lg text-sm bg-white">
                    <option value="1">1 pkt (Niska waga)</option>
                    <option value="2">2 pkt (Średnia waga)</option>
                    <option value="3">3 pkt (Wysoka waga)</option>
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-gray-500">Początek (opcjonalnie):</label>
                      <input type="datetime-local" value={startDate} onChange={e => setStartDate(e.target.value)} className="border p-2 rounded w-full text-xs" />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500">Termin (koniec):</label>
                      <input type="datetime-local" value={dueDate} onChange={e => setDueDate(e.target.value)} className="border p-2 rounded w-full text-xs" />
                    </div>
                  </div>
                </div>
              )}

              {taskTemplate !== 'custom' && !editingTaskId && (
                <div className="bg-blue-50 border border-blue-100 p-3 rounded-xl">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold text-blue-800">Wybierz dni w miesiącu:</span>
                    <span className="text-xs text-blue-600 bg-white px-2 py-0.5 rounded-full border">{selectedDays.length} dni</span>
                  </div>
                  <div className="grid grid-cols-7 gap-1.5 mb-3">
                    {daysArray.map(day => (
                      <button
                        key={day} type="button" onClick={() => toggleDay(day)}
                        className={`h-8 flex items-center justify-center text-xs rounded border font-semibold transition-all ${
                          selectedDays.includes(day) ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-gray-600 hover:bg-blue-100'
                        }`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2 text-xs">
                    <button type="button" onClick={selectAllDays} className="bg-white border px-3 py-1.5 rounded-lg font-semibold text-gray-700 active:scale-95">Wszystkie</button>
                    <button type="button" onClick={selectWeekdays} className="bg-white border px-3 py-1.5 rounded-lg font-semibold text-gray-700 active:scale-95">Robocze</button>
                    <button type="button" onClick={() => setSelectedDays([])} className="text-gray-400 px-2 underline">Wyczyść</button>
                  </div>
                </div>
              )}

              <div className="flex gap-2 mt-2">
                <button type="submit" className="flex-1 bg-blue-600 text-white p-3 rounded-lg font-bold text-sm shadow active:scale-95 transition-transform">
                  {editingTaskId ? 'Zapisz zmiany' : 'Dodaj zadania'}
                </button>
                {editingTaskId && (
                  <button type="button" onClick={resetForm} className="bg-gray-200 text-gray-700 px-4 rounded-lg text-sm font-bold active:scale-95">Anuluj</button>
                )}
              </div>
            </form>
          </div>

          {/* Do Akceptacji */}
          <div className="bg-white p-4 rounded-xl shadow-sm border mb-6">
            <h2 className="font-bold text-gray-800 mb-3 flex justify-between">
              <span>Do akceptacji</span>
              <span className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full">{tasks.filter(t => t.status === 'waiting_approval').length}</span>
            </h2>
            <div className="flex flex-col gap-3">
              {tasks.filter(t => t.status === 'waiting_approval').map(task => (
                <div key={task.id} className="flex justify-between items-center bg-gray-50 p-3 rounded-lg border">
                  <div>
                    <p className="font-semibold text-sm">{task.title} <span className="text-xs text-gray-500">({task.profiles?.name})</span></p>
                    <p className="text-[10px] text-gray-400">{formatTaskTime(task.start_date, task.due_date)}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleParentApproval(task.id, 'approved')} className="bg-green-600 text-white text-xs px-3 py-1.5 rounded font-bold active:scale-95">Tak</button>
                    <button onClick={() => handleParentApproval(task.id, 'failed')} className="bg-red-100 text-red-600 text-xs px-3 py-1.5 rounded font-bold active:scale-95">Nie</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Lista wszystkich zadań */}
          <div className="bg-white p-4 rounded-xl shadow-sm border">
            <div className="flex justify-between items-center mb-3">
              <h2 className="font-bold text-gray-800">Zadania w miesiącu</h2>
            </div>
            <div className="flex gap-2 mb-4">
              <select value={filterTeen} onChange={e => setFilterTeen(e.target.value)} className="border p-1.5 rounded text-xs bg-gray-50 flex-1">
                <option value="all">Wszyscy</option>
                {teens.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="border p-1.5 rounded text-xs bg-gray-50 flex-1">
                <option value="all">Wszystkie</option>
                <option value="pending">Do zrobienia</option>
                <option value="waiting_approval">Czekają</option>
                <option value="approved">Zatwierdzone</option>
              </select>
            </div>
            <div className="flex flex-col gap-2">
              {tasks.filter(t => (filterTeen === 'all' || t.assignee_id === filterTeen) && (filterStatus === 'all' || t.status === filterStatus)).map(task => (
                <div key={task.id} className="border p-3 rounded-xl flex justify-between items-center bg-white shadow-2xs">
                  <div>
                    <p className="font-semibold text-sm text-gray-800">{task.title} <span className="font-normal text-xs text-gray-500">({task.profiles?.name})</span></p>
                    <p className="text-[11px] text-gray-500 mt-0.5">{formatTaskTime(task.start_date, task.due_date)} • {task.weight} pkt</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleEditClick(task)} className="text-gray-400 bg-gray-50 border px-2 py-1 rounded text-xs font-bold active:bg-gray-200">Edit</button>
                    <button onClick={() => handleDeleteTask(task.id)} className="text-gray-400 bg-gray-50 border px-2 py-1 rounded text-xs active:bg-gray-200">🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        // --- WIDOK NASTOLATKA ---
        <>
          {(() => {
            const stats = allStats[0] || { success_rate: 100, earned_points: 0, max_points_to_date: 0 }
            const baseAllowance = user.base_allowance || 100
            const bonusAllowance = user.bonus_allowance || 30
            const currentBaseEarned = baseAllowance * (stats.success_rate / 100)
            const hasBonus = stats.success_rate > 90
            const totalEstimatedPayout = currentBaseEarned + (hasBonus ? bonusAllowance : 0)

            const myTasks = tasks.filter(t => t.assignee_id === user.id)
            const activeTasks = myTasks.filter(t => t.status === 'pending')
            const historyTasks = myTasks.filter(t => t.status !== 'pending')

            return (
              <>
                <div className="bg-gradient-to-br from-blue-600 to-blue-800 text-white p-5 rounded-2xl shadow-md mb-6">
                  <h2 className="text-xs font-bold text-blue-200 uppercase tracking-wider">Prognoza wypłaty</h2>
                  <div className="mt-2 text-4xl font-black">{totalEstimatedPayout.toFixed(0)} <span className="text-xl font-normal">zł</span></div>
                  <div className="w-full bg-blue-900/50 rounded-full h-2.5 mt-4 overflow-hidden">
                    <div className={`h-2.5 rounded-full transition-all duration-500 ${hasBonus ? 'bg-green-400' : 'bg-orange-400'}`} style={{ width: `${Math.min(stats.success_rate, 100)}%` }}></div>
                  </div>
                  <div className="flex justify-between text-[11px] text-blue-200 mt-1">
                    <span>Skuteczność: {stats.success_rate}%</span>
                    <span>Cel: &gt;90%</span>
                  </div>
                </div>

                <div className="flex bg-gray-200 p-1 rounded-xl mb-4">
                  <button onClick={() => setTeenTab('active')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors ${teenTab === 'active' ? 'bg-white shadow text-blue-600' : 'text-gray-600'}`}>Zadania</button>
                  <button onClick={() => setTeenTab('history')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors ${teenTab === 'history' ? 'bg-white shadow text-blue-600' : 'text-gray-600'}`}>Historia</button>
                  <button onClick={() => setTeenTab('wallet')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors ${teenTab === 'wallet' ? 'bg-white shadow text-blue-600' : 'text-gray-600'}`}>Portfel</button>
                </div>

                {teenTab === 'wallet' && (
                  <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                    <h2 className="font-bold text-gray-800 mb-3">Szczegóły rozliczenia</h2>
                    <div className="flex flex-col gap-3 text-sm">
                      <div className="flex justify-between p-3 bg-gray-50 rounded-xl">
                        <span className="text-gray-600">Baza miesięczna:</span><span className="font-bold">{baseAllowance} zł</span>
                      </div>
                      <div className="flex justify-between p-3 bg-gray-50 rounded-xl">
                        <span className="text-gray-600">Wypracowano ({stats.success_rate}%):</span><span className="font-bold text-blue-600">+{currentBaseEarned.toFixed(0)} zł</span>
                      </div>
                      <div className="flex justify-between p-3 bg-gray-50 rounded-xl">
                        <span className="text-gray-600">Premia &gt; 90%:</span><span className={`font-bold ${hasBonus ? 'text-green-600' : 'text-gray-400'}`}>{hasBonus ? `+${bonusAllowance} zł` : '0 zł'}</span>
                      </div>
                      <div className="flex justify-between p-4 bg-blue-50 rounded-xl border border-blue-100 mt-2">
                        <span className="font-bold text-blue-900">Do wypłaty:</span><span className="font-black text-blue-600 text-lg">{totalEstimatedPayout.toFixed(0)} zł</span>
                      </div>
                    </div>
                  </div>
                )}

                {teenTab !== 'wallet' && (
                  <div className="bg-white p-4 rounded-2xl shadow-sm border">
                    <div className="flex flex-col gap-3">
                      {(teenTab === 'active' ? activeTasks : historyTasks).length === 0 && (
                         <p className="text-xs text-gray-400 py-4 text-center">Brak zadań w tej sekcji. Odpoczywaj! 🎉</p>
                      )}
                      
                      {(teenTab === 'active' ? activeTasks : historyTasks).map(task => {
                        // Logika blokady zadań z przyszłości
                        const isFuture = task.start_date ? new Date(task.start_date) > new Date() : false;

                        return (
                          <div key={task.id} className={`border p-3 rounded-xl flex justify-between items-center shadow-2xs ${isFuture ? 'bg-gray-50 opacity-70' : 'bg-white'}`}>
                            <div>
                              <p className={`font-semibold text-sm ${isFuture ? 'text-gray-500' : 'text-gray-800'}`}>{task.title}</p>
                              <p className="text-[11px] text-gray-500 mt-0.5">{formatTaskTime(task.start_date, task.due_date)} • {task.weight} pkt</p>
                            </div>
                            <div>
                              {task.status === 'pending' && (
                                <button 
                                  onClick={() => {
                                    if (isFuture) {
                                      showToast(`Zadanie aktywne dopiero: ${formatFutureTime(task.start_date)} ⏳`);
                                    } else {
                                      handleTeenAction(task.id, 'waiting_approval');
                                    }
                                  }}
                                  className={`text-xs px-4 py-2 rounded-lg font-bold shadow-sm transition-transform ${
                                    isFuture 
                                      ? 'bg-gray-200 text-gray-500' 
                                      : 'bg-blue-600 text-white active:scale-95'
                                  }`}
                                >
                                  {isFuture ? 'Za wcześnie' : 'Zrobione'}
                                </button>
                              )}
                              {task.status === 'waiting_approval' && <span className="text-xs text-blue-600 font-bold">Czeka</span>}
                              {task.status === 'approved' && <span className="text-xs text-green-600 font-bold">✅ Zatwierdzone</span>}
                              {task.status === 'failed' && <span className="text-xs text-red-500 font-bold">❌ Niewykonane</span>}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </>
            )
          })()}
        </>
      )}
    </div>
  )
}
