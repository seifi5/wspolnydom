import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

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
  const [allTasks, setAllTasks] = useState([])
  const [teens, setTeens] = useState([])
  const [budgets, setBudgets] = useState({})

  // Formularz
  const [taskMode, setTaskMode] = useState('base')
  const [taskTemplate, setTaskTemplate] = useState('dog_morning')
  const [assigneeId, setAssigneeId] = useState('all') 
  const [selectedDays, setSelectedDays] = useState([]) 
  const [customTitle, setCustomTitle] = useState('')
  const [customWeight, setCustomWeight] = useState(1)
  const [bountyReward, setBountyReward] = useState(10)
  const [startDate, setStartDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [editingTaskId, setEditingTaskId] = useState(null)

  // Filtry i Zakładki
  const [filterTeen, setFilterTeen] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [parentTab, setParentTab] = useState('dashboard') // dashboard | tasks | archive
  const [teenTab, setTeenTab] = useState('active') // active | bounty | wallet | archive
  const [expandedMonth, setExpandedMonth] = useState(null) // Do rozwijania historii

  const [toastMessage, setToastMessage] = useState('')

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  const currentMonthName = now.toLocaleString('pl-PL', { month: 'long', year: 'numeric' }).toUpperCase()
  const startOfThisMonth = new Date(year, month, 1).toISOString()

  // Separacja zadań na obecny miesiąc i historię
  const tasks = allTasks.filter(t => t.due_date >= startOfThisMonth)
  const historyTasks = allTasks.filter(t => t.due_date < startOfThisMonth)

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

  // Grupowanie historii
  const groupTasksByMonth = (tasksToGroup) => {
    const groups = {}
    tasksToGroup.forEach(t => {
      const d = new Date(t.due_date)
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
      if (!groups[key]) groups[key] = { label: d.toLocaleString('pl-PL', { month: 'long', year: 'numeric' }), tasks: [] }
      groups[key].tasks.push(t)
    })
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0])) // Sort malejąco (najnowsze pierwsze)
  }

  // Obliczanie statystyk (używane do current i history)
  const calculateStats = (teenId, taskList, teenProfile) => {
    const teenTasks = taskList.filter(t => t.assignee_id === teenId)
    const baseTasks = teenTasks.filter(t => t.reward === 0)
    const extraTasks = teenTasks.filter(t => t.reward > 0 && t.status === 'approved')

    const maxPoints = baseTasks.reduce((s, t) => s + t.weight, 0)
    const earnedPoints = baseTasks.filter(t => t.status === 'approved').reduce((s, t) => s + t.weight, 0)
    const successRate = maxPoints === 0 ? 100 : Math.round((earnedPoints / maxPoints) * 100)
    
    const baseAllowance = teenProfile?.base_allowance || 0
    const bonusAllowance = teenProfile?.bonus_allowance || 0
    
    const currentBaseEarned = baseAllowance * (successRate / 100)
    const hasBonus = successRate > 90
    const extraEarned = extraTasks.reduce((s, t) => s + t.reward, 0)
    const totalPayout = currentBaseEarned + (hasBonus ? bonusAllowance : 0) + extraEarned

    return { successRate, maxPoints, earnedPoints, currentBaseEarned, hasBonus, bonusAllowance, extraEarned, totalPayout }
  }

  // Komponent Statusu
  const StatusBadge = ({ status }) => {
    const styles = {
      pending: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
      waiting_approval: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20',
      approved: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
      failed: 'text-rose-400 bg-rose-400/10 border-rose-400/20'
    }
    const labels = { pending: 'Do zrobienia', waiting_approval: 'Czeka', approved: 'Zatwierdzone', failed: 'Niewykonane' }
    return <span className={`text-[10px] px-2 py-0.5 rounded-full border ${styles[status]}`}>{labels[status]}</span>
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
    }
  }

  const fetchTeens = async () => {
    const { data } = await supabase.from('profiles').select('*').eq('role', 'teen')
    if (data) {
      setTeens(data)
      if (data.length > 0 && assigneeId === '') setAssigneeId(data[0].id)
      const budgetMap = {}
      data.forEach(t => budgetMap[t.id] = { base: t.base_allowance, bonus: t.bonus_allowance })
      setBudgets(budgetMap)
    }
  }

  const fetchTasks = async () => {
    // Pobieramy wszystko, limit 1000 żeby obsłużyć cały rok. 
    const { data } = await supabase.from('monthly_tasks').select('*, profiles(name)').order('due_date', { ascending: true }).limit(1000)
    if (data) setAllTasks(data)
  }

  const handleSaveTask = async (e) => {
    e.preventDefault()
    if (editingTaskId || taskTemplate === 'custom' || taskMode === 'extra') {
      if (!customTitle || !dueDate) return alert('Wypełnij nazwę i termin.')
      const isExtra = taskMode === 'extra' || (editingTaskId && customWeight === 0)
      const payload = {
        title: customTitle,
        assignee_id: assigneeId === 'all' ? null : assigneeId,
        weight: isExtra ? 0 : parseInt(customWeight),
        reward: isExtra ? parseFloat(bountyReward) : 0,
        start_date: startDate ? new Date(startDate).toISOString() : null,
        due_date: new Date(dueDate).toISOString()
      }

      if (editingTaskId) {
        await supabase.from('monthly_tasks').update(payload).eq('id', editingTaskId)
      } else {
        payload.status = 'pending'
        await supabase.from('monthly_tasks').insert([payload])
      }
    } else {
      if (selectedDays.length === 0) return alert('Zaznacz dni.')
      const t = TEMPLATES[taskTemplate]
      const inserts = selectedDays.map(day => ({
        title: t.title, assignee_id: assigneeId, weight: t.weight, reward: 0,
        start_date: new Date(year, month, day, t.startHour, 0, 0).toISOString(),
        due_date: new Date(year, month, day, t.dueHour, 0, 0).toISOString(), status: 'pending'
      }))
      await supabase.from('monthly_tasks').insert(inserts)
    }
    resetForm()
    fetchTasks()
    showToast('Zapisano pomyślnie! ✅')
  }

  const resetForm = () => {
    setTaskTemplate('dog_morning')
    setCustomTitle('')
    setStartDate('')
    setDueDate('')
    setEditingTaskId(null)
    setSelectedDays([])
    setAssigneeId(teens.length > 0 ? teens[0].id : '')
  }

  const handleEditClick = (task) => {
    setEditingTaskId(task.id)
    setTaskMode(task.reward > 0 ? 'extra' : 'base')
    setTaskTemplate('custom') 
    setCustomTitle(task.title)
    setAssigneeId(task.assignee_id || 'all')
    setCustomWeight(task.weight)
    setBountyReward(task.reward || 10)
    setStartDate(toLocalIsoString(task.start_date))
    setDueDate(toLocalIsoString(task.due_date))
  }

  const handleDeleteTask = async (id) => {
    if (confirm('Usunąć zadanie?')) {
      await supabase.from('monthly_tasks').delete().eq('id', id)
      fetchTasks()
    }
  }

  const toggleDay = (day) => setSelectedDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day])
  const selectAllDays = () => setSelectedDays([...daysArray])
  const selectWeekdays = () => setSelectedDays(daysArray.filter(day => { const d = new Date(year, month, day).getDay(); return d !== 0 && d !== 6 }))

  const handleTeenAction = async (taskId, newStatus) => {
    await supabase.from('monthly_tasks').update({ status: newStatus, completed_at: newStatus === 'waiting_approval' ? new Date() : null }).eq('id', taskId)
    fetchTasks()
    if (newStatus === 'waiting_approval') showToast('Przekazano do akceptacji! 🎉')
  }

  const handleClaimBounty = async (taskId) => {
    await supabase.from('monthly_tasks').update({ assignee_id: user.id }).eq('id', taskId)
    fetchTasks()
    showToast('Zadanie przypisane do Ciebie! 💪')
  }

  const handleParentApproval = async (taskId, status) => {
    await supabase.from('monthly_tasks').update({ status }).eq('id', taskId)
    fetchTasks()
  }

  const handleBudgetChange = (teenId, field, value) => setBudgets(prev => ({ ...prev, [teenId]: { ...prev[teenId], [field]: value } }))
  const handleSaveBudgets = async () => {
    for (const teenId of Object.keys(budgets)) {
      await supabase.from('profiles').update({ base_allowance: parseFloat(budgets[teenId].base) || 0, bonus_allowance: parseFloat(budgets[teenId].bonus) || 0 }).eq('id', teenId)
    }
    showToast('Budżety zaktualizowane! 💰')
    fetchTeens()
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-indigo-950 to-slate-900 text-white flex flex-col items-center justify-center p-4">
        <h1 className="text-4xl font-black mb-8 tracking-wider bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent drop-shadow-[0_0_15px_rgba(34,211,238,0.5)]">
          WSPÓLNY DOM
        </h1>
        <form onSubmit={handleLogin} className="flex flex-col gap-4 w-full max-w-xs bg-white/10 backdrop-blur-md border border-white/10 p-8 rounded-3xl shadow-2xl">
          <input type="password" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN (4 cyfry)" className="bg-white/5 border border-white/20 text-white placeholder-gray-400 p-4 rounded-xl text-center text-2xl tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-cyan-400 transition-all" />
          <button type="submit" className="bg-gradient-to-r from-cyan-500 to-blue-500 text-white p-4 rounded-xl font-bold text-lg shadow-[0_0_15px_rgba(34,211,238,0.3)] hover:shadow-[0_0_25px_rgba(34,211,238,0.6)] active:scale-95 transition-all">WEJDŹ</button>
          {error && <p className="text-rose-400 text-center text-sm font-semibold">{error}</p>}
        </form>
      </div>
    )
  }

  // Komponent generujący kartę widoku historii (używany przez rodzica i dziecko)
  const HistoryCard = ({ monthKey, data, isParent }) => {
    const isExpanded = expandedMonth === monthKey
    return (
      <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-4 mb-4 shadow-lg transition-all">
        <div className="flex justify-between items-center cursor-pointer" onClick={() => setExpandedMonth(isExpanded ? null : monthKey)}>
          <div>
            <h3 className="font-bold text-lg text-white capitalize">{data.label}</h3>
            <p className="text-xs text-gray-400">Wykonane zadania: {data.tasks.filter(t=>t.status==='approved').length} / {data.tasks.length}</p>
          </div>
          <div className="text-right">
            <span className="text-xs bg-white/10 px-2 py-1 rounded-lg text-gray-300">
              {isExpanded ? 'Zwiń ▴' : 'Rozwiń ▾'}
            </span>
          </div>
        </div>
        
        {isExpanded && (
          <div className="mt-4 pt-4 border-t border-white/10 flex flex-col gap-3">
            {isParent ? (
              teens.map(teen => {
                const stats = calculateStats(teen.id, data.tasks, teen)
                return (
                  <div key={teen.id} className="bg-black/20 p-3 rounded-xl border border-white/5">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-bold text-cyan-400">{teen.name}</span>
                      <span className="font-black text-white">{stats.totalPayout.toFixed(0)} zł</span>
                    </div>
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>Skuteczność: <span className={stats.hasBonus ? 'text-emerald-400 font-bold' : ''}>{stats.successRate}%</span></span>
                      <span>Bounties: +{stats.extraEarned} zł</span>
                    </div>
                  </div>
                )
              })
            ) : (
              (() => {
                const stats = calculateStats(user.id, data.tasks, user)
                return (
                  <div className="bg-black/20 p-4 rounded-xl border border-white/5">
                     <div className="flex justify-between items-center mb-3">
                      <span className="text-sm text-gray-300">Suma zarobków:</span>
                      <span className="font-black text-2xl text-emerald-400">{stats.totalPayout.toFixed(0)} zł</span>
                    </div>
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>Skuteczność (Baza + Bonus):</span>
                      <span className="text-white">{stats.currentBaseEarned.toFixed(0)} zł {stats.hasBonus ? `+ ${stats.bonusAllowance} zł` : ''}</span>
                    </div>
                    <div className="flex justify-between text-xs text-gray-400 mb-4">
                      <span>Zadania ekstra:</span>
                      <span className="text-white">+{stats.extraEarned} zł</span>
                    </div>
                    <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Lista zadań w tym miesiącu</h4>
                    <div className="flex flex-col gap-2">
                      {data.tasks.filter(t => t.assignee_id === user.id).map(task => (
                        <div key={task.id} className="flex justify-between items-center bg-white/5 p-2 rounded-lg">
                          <div>
                            <p className="text-xs font-semibold text-gray-200">{task.title}</p>
                            <p className="text-[10px] text-gray-500">{new Date(task.due_date).toLocaleDateString()}</p>
                          </div>
                          <div className="text-right">
                            <StatusBadge status={task.status} />
                            {task.reward > 0 && <p className="text-[10px] text-emerald-400 mt-1">+{task.reward} zł</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-indigo-950 to-slate-900 text-white pb-12 font-sans selection:bg-cyan-500/30">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-6 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none">
          <div className="bg-slate-800/90 backdrop-blur-lg border border-cyan-500/50 text-white px-5 py-3 rounded-2xl shadow-[0_0_20px_rgba(34,211,238,0.3)] text-sm font-bold text-center w-full max-w-sm animate-bounce">
            {toastMessage}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="p-5 flex justify-between items-center bg-white/5 backdrop-blur-md border-b border-white/10 sticky top-0 z-40">
        <div>
          <h1 className="text-lg font-black tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400">
            {user.role === 'parent' ? 'PANEL RODZICA' : `CZEŚĆ, ${user.name.toUpperCase()}!`}
          </h1>
          <p className="text-xs text-cyan-200/70 font-semibold tracking-wider mt-0.5">{currentMonthName}</p>
        </div>
        <button onClick={() => setUser(null)} className="text-xs font-bold text-slate-300 bg-white/10 hover:bg-white/20 px-4 py-2 rounded-full transition-all border border-white/10">WYLOGUJ</button>
      </div>

      <div className="p-4 max-w-md mx-auto">
        {user.role === 'parent' ? (
          // --- WIDOK RODZICA ---
          <>
            {/* Nawigacja Rodzica */}
            <div className="flex bg-white/5 p-1 rounded-xl mb-6 border border-white/10">
              <button onClick={() => setParentTab('dashboard')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${parentTab === 'dashboard' ? 'bg-cyan-500/20 text-cyan-400 shadow-lg' : 'text-gray-400'}`}>Pulpit</button>
              <button onClick={() => setParentTab('tasks')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${parentTab === 'tasks' ? 'bg-cyan-500/20 text-cyan-400 shadow-lg' : 'text-gray-400'}`}>Planowanie</button>
              <button onClick={() => setParentTab('archive')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${parentTab === 'archive' ? 'bg-cyan-500/20 text-cyan-400 shadow-lg' : 'text-gray-400'}`}>Archiwum</button>
            </div>

            {parentTab === 'dashboard' && (
              <div className="animate-fade-in">
                <div className="flex flex-col gap-3 mb-6">
                  {teens.map(teen => {
                    const stats = calculateStats(teen.id, tasks, teen)
                    return (
                      <div key={teen.id} className="bg-white/10 backdrop-blur-md border border-white/20 p-5 rounded-2xl shadow-xl flex justify-between items-center relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-2xl -mr-10 -mt-10"></div>
                        <div className="z-10">
                          <h2 className="font-bold text-lg text-white">{teen.name}</h2>
                          <p className="text-xs text-gray-300 mt-1">Skuteczność: <span className="font-bold text-cyan-400">{stats.successRate}%</span></p>
                        </div>
                        <div className="text-right z-10">
                          <div className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">{stats.totalPayout.toFixed(0)} zł</div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="bg-white/5 backdrop-blur-md border border-white/10 p-5 rounded-2xl shadow-xl mb-6">
                  <h2 className="font-bold text-cyan-400 mb-4 text-sm tracking-wider uppercase">Budżety miesięczne</h2>
                  <div className="flex flex-col gap-4">
                    {teens.map(teen => (
                      <div key={teen.id} className="bg-black/20 p-3 rounded-xl border border-white/5 grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] text-gray-400 mb-1 block">Baza (zł):</label>
                          <input type="number" value={budgets[teen.id]?.base ?? teen.base_allowance} onChange={e => handleBudgetChange(teen.id, 'base', e.target.value)} className="w-full bg-white/5 border border-white/10 text-white rounded-lg p-2 text-sm focus:ring-1 focus:ring-cyan-500 outline-none" />
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-400 mb-1 block">Bonus &gt;90%:</label>
                          <input type="number" value={budgets[teen.id]?.bonus ?? teen.bonus_allowance} onChange={e => handleBudgetChange(teen.id, 'bonus', e.target.value)} className="w-full bg-white/5 border border-white/10 text-white rounded-lg p-2 text-sm focus:ring-1 focus:ring-cyan-500 outline-none" />
                        </div>
                      </div>
                    ))}
                    <button onClick={handleSaveBudgets} className="w-full bg-white/10 border border-white/20 text-white text-xs py-3 rounded-xl font-bold shadow-lg active:scale-95 transition-all hover:bg-white/20 mt-1">ZAPISZ BUDŻETY</button>
                  </div>
                </div>

                <div className="bg-white/5 backdrop-blur-md border border-white/10 p-5 rounded-2xl shadow-xl mb-6">
                  <h2 className="font-bold text-cyan-400 mb-4 text-sm tracking-wider uppercase flex justify-between">
                    Oczekujące
                    <span className="bg-cyan-500/20 text-cyan-300 text-[10px] px-2 py-0.5 rounded-full border border-cyan-500/30">{tasks.filter(t => t.status === 'waiting_approval').length}</span>
                  </h2>
                  <div className="flex flex-col gap-3">
                    {tasks.filter(t => t.status === 'waiting_approval').map(task => (
                      <div key={task.id} className="flex justify-between items-center bg-black/20 p-3 rounded-xl border border-white/5">
                        <div>
                          <p className="font-semibold text-sm text-gray-200">{task.title} <span className="text-xs text-gray-400">({task.profiles?.name || 'Ktoś'})</span></p>
                          <p className="text-[10px] text-gray-500 mt-1">{formatTaskTime(task.start_date, task.due_date)}</p>
                          {task.reward > 0 && <span className="text-[10px] font-bold text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-2 py-0.5 rounded-full mt-1 inline-block">Ekstra: {task.reward} zł</span>}
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => handleParentApproval(task.id, 'approved')} className="bg-emerald-500/80 hover:bg-emerald-500 text-white text-xs px-3 py-2 rounded-lg font-bold shadow-lg active:scale-95 transition-all">Tak</button>
                          <button onClick={() => handleParentApproval(task.id, 'failed')} className="bg-rose-500/80 hover:bg-rose-500 text-white text-xs px-3 py-2 rounded-lg font-bold shadow-lg active:scale-95 transition-all">Nie</button>
                        </div>
                      </div>
                    ))}
                    {tasks.filter(t => t.status === 'waiting_approval').length === 0 && <p className="text-xs text-gray-500 text-center py-2">Brak zadań do sprawdzenia.</p>}
                  </div>
                </div>
              </div>
            )}

            {parentTab === 'tasks' && (
              <div className="animate-fade-in">
                <div className="bg-white/10 backdrop-blur-md border border-white/20 p-5 rounded-2xl shadow-xl mb-6">
                  <h2 className="font-bold text-cyan-400 mb-4 text-sm tracking-wider uppercase">{editingTaskId ? 'Edytuj zadanie' : 'Zaplanuj zadanie'}</h2>
                  
                  {!editingTaskId && (
                    <div className="flex bg-black/30 p-1 rounded-xl mb-4 border border-white/5">
                      <button onClick={() => { setTaskMode('base'); setAssigneeId(teens[0]?.id); }} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${taskMode === 'base' ? 'bg-cyan-500/20 text-cyan-400 shadow' : 'text-gray-500'}`}>Obowiązki</button>
                      <button onClick={() => { setTaskMode('extra'); setAssigneeId('all'); }} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${taskMode === 'extra' ? 'bg-emerald-500/20 text-emerald-400 shadow' : 'text-gray-500'}`}>Ekstra płatne 💰</button>
                    </div>
                  )}

                  <form onSubmit={handleSaveTask} className="flex flex-col gap-4">
                    <div className="grid grid-cols-2 gap-3">
                      <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)} className="bg-slate-800 border border-white/10 text-white p-2.5 rounded-xl text-sm outline-none focus:ring-1 focus:ring-cyan-400">
                        {taskMode === 'extra' && <option value="all">📢 Tablica (Giełda)</option>}
                        {teens.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>

                      {taskMode === 'base' && !editingTaskId && (
                        <select value={taskTemplate} onChange={e => setTaskTemplate(e.target.value)} className="bg-slate-800 border border-white/10 text-white p-2.5 rounded-xl text-sm outline-none focus:ring-1 focus:ring-cyan-400">
                          {Object.keys(TEMPLATES).map(key => <option key={key} value={key}>{TEMPLATES[key].title}</option>)}
                        </select>
                      )}
                    </div>

                    {(taskTemplate === 'custom' || taskMode === 'extra' || editingTaskId) && (
                      <div className="bg-black/20 p-4 rounded-xl border border-white/5 flex flex-col gap-4">
                        <input type="text" placeholder="Opisz zadanie..." value={customTitle} onChange={e => setCustomTitle(e.target.value)} className="bg-transparent border-b border-white/20 text-white placeholder-gray-500 p-2 text-sm focus:border-cyan-400 outline-none transition-colors" />
                        
                        {taskMode === 'extra' ? (
                          <div>
                            <label className="text-[10px] text-gray-400 mb-1 block">Nagroda finansowa (zł):</label>
                            <input type="number" min="1" value={bountyReward} onChange={e => setBountyReward(e.target.value)} className="bg-white/5 border border-emerald-500/30 text-emerald-400 p-2 rounded-lg text-sm font-bold w-full outline-none focus:ring-1 focus:ring-emerald-400" />
                          </div>
                        ) : (
                          <select value={customWeight} onChange={e => setCustomWeight(e.target.value)} className="bg-slate-800 border border-white/10 text-white p-2 rounded-lg text-sm outline-none focus:ring-1 focus:ring-cyan-400">
                            <option value="1">1 pkt (Niska waga)</option>
                            <option value="2">2 pkt (Średnia waga)</option>
                            <option value="3">3 pkt (Wysoka waga)</option>
                          </select>
                        )}

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[10px] text-gray-400 block mb-1">Początek (opcjonalnie):</label>
                            <input type="datetime-local" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded p-1.5 text-xs text-white" />
                          </div>
                          <div>
                            <label className="text-[10px] text-gray-400 block mb-1">Termin (koniec):</label>
                            <input type="datetime-local" value={dueDate} onChange={e => setDueDate(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded p-1.5 text-xs text-white" />
                          </div>
                        </div>
                      </div>
                    )}

                    {taskMode === 'base' && taskTemplate !== 'custom' && !editingTaskId && (
                      <div className="bg-cyan-500/10 border border-cyan-500/20 p-4 rounded-xl">
                        <div className="text-xs font-bold text-cyan-300 mb-3">Wybierz dni w miesiącu:</div>
                        <div className="grid grid-cols-7 gap-1.5 mb-3">
                          {daysArray.map(day => (
                            <button key={day} type="button" onClick={() => toggleDay(day)} className={`h-8 flex items-center justify-center text-xs rounded-lg border font-semibold transition-all ${selectedDays.includes(day) ? 'bg-cyan-500 text-white border-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.5)]' : 'bg-black/30 text-gray-400 border-white/5 hover:bg-white/10'}`}>{day}</button>
                          ))}
                        </div>
                        <div className="flex gap-2 text-xs">
                          <button type="button" onClick={selectAllDays} className="bg-white/10 border border-white/10 text-white px-3 py-1.5 rounded-lg font-semibold active:scale-95 transition-all">Wszystkie</button>
                          <button type="button" onClick={selectWeekdays} className="bg-white/10 border border-white/10 text-white px-3 py-1.5 rounded-lg font-semibold active:scale-95 transition-all">Robocze</button>
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2 mt-2">
                      <button type="submit" className={`flex-1 text-white p-3 rounded-xl font-bold text-sm shadow-lg active:scale-95 transition-all ${taskMode === 'extra' ? 'bg-gradient-to-r from-emerald-500 to-teal-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 'bg-gradient-to-r from-cyan-500 to-blue-500 shadow-[0_0_15px_rgba(34,211,238,0.3)]'}`}>
                        {editingTaskId ? 'ZAPISZ ZMIANY' : (taskMode === 'extra' ? 'WRZUĆ NA GIEŁDĘ' : 'DODAJ ZADANIA')}
                      </button>
                      {editingTaskId && <button type="button" onClick={resetForm} className="bg-white/10 border border-white/20 px-4 rounded-xl text-sm font-bold active:scale-95 text-gray-300">Anuluj</button>}
                    </div>
                  </form>
                </div>

                <div className="bg-white/5 backdrop-blur-md border border-white/10 p-5 rounded-2xl shadow-xl">
                  <h2 className="font-bold text-cyan-400 mb-4 text-sm tracking-wider uppercase">Lista zadań ({currentMonthName})</h2>
                  <div className="flex gap-2 mb-4">
                    <select value={filterTeen} onChange={e => setFilterTeen(e.target.value)} className="flex-1 bg-slate-800 border border-white/10 text-white p-2 rounded-lg text-xs outline-none">
                      <option value="all">Wszyscy</option>
                      {teens.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="flex-1 bg-slate-800 border border-white/10 text-white p-2 rounded-lg text-xs outline-none">
                      <option value="all">Wszystkie statusy</option>
                      <option value="pending">Do zrobienia</option>
                      <option value="waiting_approval">Czekają</option>
                      <option value="approved">Zatwierdzone</option>
                      <option value="failed">Niewykonane</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-2">
                    {tasks.filter(t => (filterTeen === 'all' || t.assignee_id === filterTeen) && (filterStatus === 'all' || t.status === filterStatus)).map(task => (
                      <div key={task.id} className="bg-black/20 border border-white/5 p-3 rounded-xl flex justify-between items-center shadow-lg">
                        <div className="flex-1">
                          <p className="font-semibold text-sm text-gray-200">{task.title} <span className="font-normal text-xs text-gray-500">({task.assignee_id ? task.profiles?.name : '📢 Giełda'})</span></p>
                          <p className="text-[10px] text-gray-500 mt-0.5 mb-1.5">{formatTaskTime(task.start_date, task.due_date)}</p>
                          <StatusBadge status={task.status} />
                          {task.reward > 0 ? (
                            <span className="ml-2 text-[10px] font-bold text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-2 py-0.5 rounded-full inline-block">+{task.reward} zł</span>
                          ) : (
                            <span className="ml-2 text-[10px] text-gray-400 bg-white/5 px-2 py-0.5 rounded-full inline-block">{task.weight} pkt</span>
                          )}
                        </div>
                        <div className="flex gap-2 pl-2">
                          <button onClick={() => handleEditClick(task)} className="text-gray-400 bg-white/5 hover:bg-white/10 border border-white/10 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all">Edytuj</button>
                          <button onClick={() => handleDeleteTask(task.id)} className="text-gray-400 bg-white/5 hover:bg-rose-500/20 hover:text-rose-400 border border-white/10 px-2.5 py-1.5 rounded-lg text-xs transition-all">🗑️</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {parentTab === 'archive' && (
              <div className="animate-fade-in">
                <h2 className="font-bold text-cyan-400 mb-4 text-sm tracking-wider uppercase ml-1">Archiwum (12 miesięcy)</h2>
                {historyTasks.length === 0 ? (
                   <p className="text-sm text-gray-400 text-center mt-10">Brak starszych danych.</p>
                ) : (
                  groupTasksByMonth(historyTasks).map(([monthKey, data]) => (
                    <HistoryCard key={monthKey} monthKey={monthKey} data={data} isParent={true} />
                  ))
                )}
              </div>
            )}
          </>
        ) : (
          // --- WIDOK NASTOLATKA ---
          <>
            {(() => {
              const stats = calculateStats(user.id, tasks, user)
              const bountyBoardTasks = tasks.filter(t => !t.assignee_id && t.status === 'pending')
              const myCurrentTasks = tasks.filter(t => t.assignee_id === user.id)

              return (
                <>
                  {/* Kafel finansowy */}
                  <div className="bg-white/10 backdrop-blur-md border border-white/20 p-6 rounded-3xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] mb-6 relative overflow-hidden">
                    <div className="absolute -top-10 -right-10 w-40 h-40 bg-cyan-500/20 rounded-full blur-3xl"></div>
                    <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-blue-500/20 rounded-full blur-3xl"></div>
                    
                    <div className="relative z-10">
                      <h2 className="text-[10px] font-bold text-cyan-300 uppercase tracking-[0.2em]">Prognoza wypłaty</h2>
                      <div className="mt-1 text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400 drop-shadow-sm">
                        {stats.totalPayout.toFixed(0)} <span className="text-2xl font-bold text-cyan-400/80">zł</span>
                      </div>
                      
                      <div className="w-full bg-black/40 rounded-full h-2 mt-5 overflow-hidden border border-white/10">
                        <div className={`h-2 rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(34,211,238,0.8)] ${stats.hasBonus ? 'bg-emerald-400' : 'bg-cyan-400'}`} style={{ width: `${Math.min(stats.successRate, 100)}%` }}></div>
                      </div>
                      <div className="flex justify-between text-[10px] text-cyan-200 mt-2 font-semibold">
                        <span>Skuteczność: {stats.successRate}%</span>
                        <span>Cel bonusu: &gt;90%</span>
                      </div>
                    </div>
                  </div>

                  {/* Nawigacja */}
                  <div className="flex overflow-x-auto bg-white/5 border border-white/10 p-1 rounded-xl mb-6 gap-1 hide-scrollbar">
                    <button onClick={() => setTeenTab('active')} className={`flex-1 min-w-[70px] py-2 text-xs font-bold rounded-lg transition-all ${teenTab === 'active' ? 'bg-cyan-500/20 text-cyan-400 shadow-md' : 'text-gray-400'}`}>Zadania</button>
                    <button onClick={() => setTeenTab('bounty')} className={`flex-1 min-w-[70px] py-2 text-xs font-bold rounded-lg transition-all ${teenTab === 'bounty' ? 'bg-emerald-500/20 text-emerald-400 shadow-md' : 'text-gray-400'}`}>
                      Giełda {bountyBoardTasks.length > 0 && <span className="bg-rose-500 text-white px-1.5 py-0.5 rounded-full text-[9px] ml-1 shadow-[0_0_8px_rgba(244,63,94,0.6)]">{bountyBoardTasks.length}</span>}
                    </button>
                    <button onClick={() => setTeenTab('wallet')} className={`flex-1 min-w-[70px] py-2 text-xs font-bold rounded-lg transition-all ${teenTab === 'wallet' ? 'bg-cyan-500/20 text-cyan-400 shadow-md' : 'text-gray-400'}`}>Portfel</button>
                    <button onClick={() => setTeenTab('archive')} className={`flex-1 min-w-[70px] py-2 text-xs font-bold rounded-lg transition-all ${teenTab === 'archive' ? 'bg-cyan-500/20 text-cyan-400 shadow-md' : 'text-gray-400'}`}>Historia</button>
                  </div>

                  {/* Widoki */}
                  {teenTab === 'wallet' && (
                    <div className="bg-white/5 backdrop-blur-md border border-white/10 p-5 rounded-2xl shadow-xl animate-fade-in">
                      <h2 className="font-bold text-cyan-400 mb-4 tracking-wider text-sm uppercase">Rozliczenie miesiąca</h2>
                      <div className="flex flex-col gap-3 text-sm">
                        <div className="flex justify-between p-3 bg-black/20 rounded-xl border border-white/5">
                          <span className="text-gray-400">Baza (max):</span><span className="font-bold text-white">{stats.maxPoints > 0 ? user.base_allowance : 0} zł</span>
                        </div>
                        <div className="flex justify-between p-3 bg-black/20 rounded-xl border border-white/5">
                          <span className="text-gray-400">Z bazy ({stats.successRate}%):</span><span className="font-bold text-cyan-400">+{stats.currentBaseEarned.toFixed(0)} zł</span>
                        </div>
                        <div className="flex justify-between p-3 bg-black/20 rounded-xl border border-white/5">
                          <span className="text-gray-400">Premia &gt; 90%:</span><span className={`font-bold ${stats.hasBonus ? 'text-emerald-400' : 'text-gray-600'}`}>{stats.hasBonus ? `+${stats.bonusAllowance} zł` : '0 zł'}</span>
                        </div>
                        <div className="flex justify-between p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                          <span className="text-emerald-400 font-semibold">Giełda Ekstra:</span><span className="font-bold text-emerald-400">+{stats.extraEarned.toFixed(0)} zł</span>
                        </div>
                        <div className="flex justify-between p-4 bg-cyan-500/10 rounded-xl border border-cyan-500/30 mt-2">
                          <span className="font-bold text-cyan-300">DO WYPŁATY:</span><span className="font-black text-cyan-400 text-lg">{stats.totalPayout.toFixed(0)} zł</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {teenTab === 'bounty' && (
                    <div className="bg-emerald-500/5 backdrop-blur-md border border-emerald-500/20 p-5 rounded-2xl shadow-xl animate-fade-in">
                      <h2 className="font-bold text-emerald-400 mb-4 tracking-wider text-sm uppercase flex items-center gap-2">📢 Tablica Ogłoszeń</h2>
                      <div className="flex flex-col gap-4">
                        {bountyBoardTasks.length === 0 && <p className="text-xs text-gray-400 text-center py-4">Brak ofert. Zajrzyj później!</p>}
                        {bountyBoardTasks.map(task => (
                          <div key={task.id} className="bg-black/40 border border-emerald-500/30 p-4 rounded-xl shadow-lg relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl"></div>
                            <div className="relative z-10 flex justify-between items-start mb-4">
                              <div>
                                <p className="font-bold text-gray-200">{task.title}</p>
                                <p className="text-[10px] text-gray-400 mt-1">{formatTaskTime(task.start_date, task.due_date)}</p>
                              </div>
                              <div className="bg-emerald-500/20 text-emerald-300 font-black text-lg px-3 py-1 rounded-lg border border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.2)]">
                                +{task.reward} zł
                              </div>
                            </div>
                            <button onClick={() => handleClaimBounty(task.id)} className="w-full bg-gradient-to-r from-emerald-600 to-teal-500 text-white font-bold py-3 rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.3)] hover:shadow-[0_0_25px_rgba(16,185,129,0.5)] active:scale-95 transition-all">
                              PODEJMUJĘ SIĘ! ✋
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {teenTab === 'active' && (
                    <div className="bg-white/5 backdrop-blur-md border border-white/10 p-5 rounded-2xl shadow-xl animate-fade-in">
                      <div className="flex flex-col gap-3">
                        {myCurrentTasks.length === 0 && <p className="text-xs text-gray-400 text-center py-4">Brak zadań. Odpoczywaj! 🎉</p>}
                        {myCurrentTasks.map(task => {
                          const isFuture = task.start_date ? new Date(task.start_date) > new Date() : false
                          const isBounty = task.reward > 0

                          return (
                            <div key={task.id} className={`bg-black/20 border p-3.5 rounded-xl flex justify-between items-center shadow-lg transition-all ${isFuture ? 'opacity-60 border-white/5' : (isBounty ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-white/10')}`}>
                              <div className="flex-1">
                                <p className={`font-semibold text-sm ${isFuture ? 'text-gray-500' : 'text-gray-200'}`}>{task.title}</p>
                                <p className="text-[10px] text-gray-400 mt-1 mb-2">{formatTaskTime(task.start_date, task.due_date)}</p>
                                <StatusBadge status={task.status} />
                                {isBounty ? (
                                  <span className="ml-2 text-[10px] font-bold text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-2 py-0.5 rounded-full inline-block">+{task.reward} zł</span>
                                ) : (
                                  <span className="ml-2 text-[10px] text-gray-500 bg-white/5 px-2 py-0.5 rounded-full inline-block">{task.weight} pkt</span>
                                )}
                              </div>
                              <div className="pl-3">
                                {task.status === 'pending' && (
                                  <button 
                                    onClick={() => { if (isFuture) showToast(`Aktywne od: ${formatFutureTime(task.start_date)} ⏳`); else handleTeenAction(task.id, 'waiting_approval'); }}
                                    className={`text-xs px-4 py-2.5 rounded-xl font-bold shadow-lg transition-all ${isFuture ? 'bg-white/5 text-gray-500 border border-white/10' : (isBounty ? 'bg-emerald-500 text-white hover:bg-emerald-400 active:scale-95 shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'bg-cyan-500 text-white hover:bg-cyan-400 active:scale-95 shadow-[0_0_10px_rgba(34,211,238,0.3)]')}`}
                                  >
                                    {isFuture ? 'Za wcześnie' : 'ZROBIONE'}
                                  </button>
                                )}
                                {/* Jeśli status inny niż pending, badge statusu wyświetla się po lewej */}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {teenTab === 'archive' && (
                    <div className="animate-fade-in">
                       {historyTasks.length === 0 ? (
                         <p className="text-sm text-gray-400 text-center mt-10">Brak starszych danych.</p>
                      ) : (
                        groupTasksByMonth(historyTasks).map(([monthKey, data]) => (
                          <HistoryCard key={monthKey} monthKey={monthKey} data={data} isParent={false} />
                        ))
                      )}
                    </div>
                  )}
                </>
              )
            })()}
          </>
        )}
      </div>
    </div>
  )
}
