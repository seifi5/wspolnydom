import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

const TEMPLATES = {
  dog_morning: { title: 'Spacer z psem (rano)', weight: 1, startHour: 7, dueHour: 9 },
  dog_afternoon: { title: 'Spacer z psem (popołudnie)', weight: 1, startHour: 14, dueHour: 16 },
  dog_evening: { title: 'Spacer z psem (wieczór)', weight: 1, startHour: 20, dueHour: 22 },
  dishwasher: { title: 'Opróżnianie zmywarki', weight: 2, startHour: 10, dueHour: 20 },
  room: { title: 'Sprzątanie pokoju', weight: 3, startHour: 10, dueHour: 20 },
  custom: { title: 'Własne zadanie', weight: 1 }
}

const WEEKDAYS_SHORT = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb', 'Nd']

export default function App() {
  const [pin, setPin] = useState('')
  const [user, setUser] = useState(null)
  const [error, setError] = useState('')
  const [allTasks, setAllTasks] = useState([])
  const [teens, setTeens] = useState([])
  const [budgets, setBudgets] = useState({})

  // Formularz planowania
  const [isPlannerOpen, setIsPlannerOpen] = useState(false)
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

  // Filtry, zakładki i interakcje
  const [filterTeen, setFilterTeen] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterType, setFilterType] = useState('all') // Nowy filtr typu zadania
  const [calendarFilterDay, setCalendarFilterDay] = useState(null)
  const [teenFilterStatus, setTeenFilterStatus] = useState('all')
  const [parentTab, setParentTab] = useState('dashboard') 
  const [teenTab, setTeenTab] = useState('active') 
  const [expandedTeenId, setExpandedTeenId] = useState(null)
  const [expandedMonth, setExpandedMonth] = useState(null) 

  const [toastMessage, setToastMessage] = useState('')

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  // Przesunięcie pierwszego dnia miesiąca (0: Poniedziałek, 6: Niedziela)
  const firstDayOfMonthRaw = new Date(year, month, 1).getDay()
  const firstDayOffset = (firstDayOfMonthRaw + 6) % 7

  const currentMonthName = now.toLocaleString('pl-PL', { month: 'long', year: 'numeric' }).toUpperCase()
  const startOfThisMonth = new Date(year, month, 1).toISOString()

  const tasks = allTasks.filter(t => t.due_date >= startOfThisMonth)
  const historyTasks = allTasks.filter(t => t.due_date < startOfThisMonth)

  const showToast = (msg) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(''), 3000)
  }

  const toLocalIsoString = (isoString) => {
    if (!isoString) return ''
    const d = new Date(isoString)
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  const formatTaskTime = (startStr, dueStr) => {
    const due = new Date(dueStr)
    const dueFormatted = due.toLocaleString('pl-PL', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    if (!startStr) return `Termin: ${dueFormatted}`
    
    const start = new Date(startStr)
    if (start.getDate() === due.getDate() && start.getMonth() === due.getMonth()) {
       return `${start.toLocaleString('pl-PL', { month: '2-digit', day: '2-digit' })}, ${start.toLocaleString('pl-PL', { hour: '2-digit', minute: '2-digit' })} - ${due.toLocaleString('pl-PL', { hour: '2-digit', minute: '2-digit' })}`
    }
    return `Od: ${start.toLocaleString('pl-PL', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })} Do: ${dueFormatted}`
  }

  const formatFutureTime = (dateStr) => {
    const d = new Date(dateStr)
    const today = new Date()
    if (d.getDate() === today.getDate() && d.getMonth() === today.getMonth()) {
        return `dzisiaj o ${d.toLocaleString('pl-PL', { hour: '2-digit', minute: '2-digit' })}`
    }
    return `${d.toLocaleString('pl-PL', { day: '2-digit', month: '2-digit' })} o ${d.toLocaleString('pl-PL', { hour: '2-digit', minute: '2-digit' })}`
  }

  const groupTasksByMonth = (tasksToGroup) => {
    const groups = {}
    tasksToGroup.forEach(t => {
      const d = new Date(t.due_date)
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
      if (!groups[key]) groups[key] = { label: d.toLocaleString('pl-PL', { month: 'long', year: 'numeric' }), tasks: [] }
      groups[key].tasks.push(t)
    })
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0])) 
  }

  const calculateStats = (teenId, taskList, teenProfile) => {
    const teenTasks = taskList.filter(t => t.assignee_id === teenId)
    const baseTasks = teenTasks.filter(t => t.reward === 0)
    const extraTasks = teenTasks.filter(t => t.reward > 0 && t.status === 'approved')

    const currentTime = new Date()
    const evaluatedBaseTasks = baseTasks.filter(t => t.status !== 'pending' || new Date(t.due_date) < currentTime)

    const maxPoints = evaluatedBaseTasks.reduce((s, t) => s + t.weight, 0)
    const earnedPoints = evaluatedBaseTasks.filter(t => t.status === 'approved').reduce((s, t) => s + t.weight, 0)
    
    const successRate = maxPoints === 0 ? 100 : Math.round((earnedPoints / maxPoints) * 100)
    
    const baseAllowance = teenProfile?.base_allowance || 0
    const bonusAllowance = teenProfile?.bonus_allowance || 0
    
    const currentBaseEarned = baseAllowance * (successRate / 100)
    const hasBonus = successRate > 90
    const extraEarned = extraTasks.reduce((s, t) => s + t.reward, 0)
    const totalPayout = currentBaseEarned + (hasBonus ? bonusAllowance : 0) + extraEarned

    return { successRate, maxPoints, earnedPoints, currentBaseEarned, hasBonus, bonusAllowance, extraEarned, totalPayout }
  }

  // Grupowanie typów zadań bazowych dla danego nastolatka
  const getTeenTaskBreakdown = (teenId) => {
    const teenTasks = tasks.filter(t => t.assignee_id === teenId && t.reward === 0)
    const breakdown = {}
    teenTasks.forEach(t => {
      if (!breakdown[t.title]) {
        breakdown[t.title] = { planned: 0, approved: 0, weight: t.weight }
      }
      breakdown[t.title].planned += 1
      if (t.status === 'approved') breakdown[t.title].approved += 1
    })
    return breakdown
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
      if (selectedDays.length === 0) return alert('Zaznacz dni w kalendarzu.')
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
    showToast('Zapisano pomyślnie')
  }

  const resetForm = () => {
    setTaskTemplate('dog_morning')
    setCustomTitle('')
    setStartDate('')
    setDueDate('')
    setEditingTaskId(null)
    setSelectedDays([])
    setAssigneeId(teens.length > 0 ? teens[0].id : '')
    setIsPlannerOpen(false)
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
    setIsPlannerOpen(true)
  }

  const handleDeleteTask = async (id) => {
    if (confirm('Usunąć zadanie?')) {
      await supabase.from('monthly_tasks').delete().eq('id', id)
      fetchTasks()
    }
  }

  const toggleDay = (day) => setSelectedDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day])
  const selectAllDays = () => setSelectedDays([...daysArray])
  const selectWeekdays = () => setSelectedDays(daysArray.filter(day => { 
    const d = (new Date(year, month, day).getDay() + 6) % 7
    return d < 5 
  }))

  const isWeekendDay = (day) => {
    const dayOfWeek = (new Date(year, month, day).getDay() + 6) % 7
    return dayOfWeek >= 5
  }

  const handleTeenAction = async (taskId, newStatus) => {
    await supabase.from('monthly_tasks').update({ status: newStatus, completed_at: newStatus === 'waiting_approval' ? new Date() : null }).eq('id', taskId)
    fetchTasks()
    if (newStatus === 'waiting_approval') showToast('Przekazano do akceptacji')
  }

  const handleClaimBounty = async (taskId) => {
    await supabase.from('monthly_tasks').update({ assignee_id: user.id }).eq('id', taskId)
    fetchTasks()
    showToast('Zadanie przypisane do Ciebie')
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
    showToast('Budżety zaktualizowane')
    fetchTeens()
  }

  const handleStatsClick = () => {
    setTeenTab('active')
    setTeenFilterStatus('evaluated')
    showToast('Widzisz zadania wpływające na ocenę')
  }

  const translateStatus = (status) => {
    const labels = { pending: 'Do zrobienia', waiting_approval: 'Czeka', approved: 'Zatwierdzone', failed: 'Niewykonane' }
    return labels[status] || status
  }

  const getStatusClass = (status) => {
    const classes = {
      pending: 'text-[#F7F4EB]/65',
      waiting_approval: 'text-[#F7F4EB]/80',
      approved: 'text-[#F7F4EB]',
      failed: 'text-[#F7F4EB]/40'
    }
    return classes[status] || 'text-[#F7F4EB]/65'
  }

  // Zbiór unikalnych nazw zadań dla filtra
  const uniqueTaskTypes = Array.from(new Set(tasks.map(t => t.title)))

  // Zadania wyfiltrowane dla panelu Rodzica w miesiącu
  const filteredParentTasks = tasks.filter(t => {
    if (filterTeen !== 'all' && t.assignee_id !== filterTeen) return false
    if (filterStatus !== 'all' && t.status !== filterStatus) return false
    if (filterType !== 'all' && t.title !== filterType) return false
    if (calendarFilterDay !== null) {
      const taskDay = new Date(t.due_date).getDate()
      if (taskDay !== calendarFilterDay) return false
    }
    return true
  })

  // Zbiór dni z zaplanowanymi zadaniami dla sterownika kalendarza
  const daysWithTasksSet = new Set(
    tasks
      .filter(t => 
        (filterTeen === 'all' || t.assignee_id === filterTeen) && 
        (filterStatus === 'all' || t.status === filterStatus) &&
        (filterType === 'all' || t.title === filterType)
      )
      .map(t => new Date(t.due_date).getDate())
  )

  if (!user) {
    return (
      <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#3A1C3B] via-[#1E0F24] to-[#120816] text-[#F7F4EB] flex flex-col items-center justify-center p-4 font-sans">
        <h1 className="text-3xl font-bold mb-10 tracking-widest text-[#F7F4EB] uppercase">
          Wspólny Dom
        </h1>
        <form onSubmit={handleLogin} className="flex flex-col gap-6 w-full max-w-xs bg-white/[0.06] backdrop-blur-[20px] border border-white/[0.12] p-8 rounded-[24px] shadow-2xl">
          
          <div className="text-center">
            <p className="text-xs text-[#F7F4EB]/65 font-bold tracking-widest uppercase mb-3">Wprowadź PIN</p>
            <input 
              type="password" 
              inputMode="numeric" 
              pattern="[0-9]*"
              maxLength={4} 
              value={pin} 
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} 
              placeholder="••••" 
              className="w-full bg-white/[0.04] border border-white/[0.08] text-[#F7F4EB] placeholder-[#F7F4EB]/30 p-4 rounded-2xl text-center text-4xl tracking-[0.5em] focus:outline-none focus:border-white/[0.2] focus:bg-white/[0.08] transition-all duration-200 font-mono" 
            />
          </div>

          <button 
            type="submit" 
            disabled={pin.length < 4}
            className={`w-full p-4 rounded-[16px] font-bold text-sm tracking-wide transition-all duration-200 uppercase ${
              pin.length === 4 
                ? 'bg-white/[0.15] hover:bg-white/[0.2] text-[#F7F4EB] border border-white/[0.12] active:scale-[0.97]' 
                : 'bg-white/[0.03] text-[#F7F4EB]/30 border border-white/[0.05] cursor-not-allowed'
            }`}
          >
            Wejdź
          </button>

          {error && <p className="text-[#F7F4EB]/70 text-center text-xs font-semibold">{error}</p>}
        </form>
      </div>
    )
  }

  const HistoryCard = ({ monthKey, data, isParent }) => {
    const isExpanded = expandedMonth === monthKey
    return (
      <div className="bg-white/[0.04] backdrop-blur-[20px] border border-white/[0.08] rounded-[24px] p-5 mb-4 transition-all duration-200">
        <div className="flex justify-between items-center cursor-pointer active:scale-[0.98] transition-all duration-200" onClick={() => setExpandedMonth(isExpanded ? null : monthKey)}>
          <div>
            <h3 className="font-bold text-base text-[#F7F4EB] capitalize">{data.label}</h3>
            <p className="text-xs text-[#F7F4EB]/65 mt-1">Wykonane zadania: {data.tasks.filter(t=>t.status==='approved').length} / {data.tasks.length}</p>
          </div>
          <div className="text-right">
            <span className="text-[10px] uppercase tracking-wider font-bold text-[#F7F4EB]/50">
              {isExpanded ? 'Zwiń' : 'Rozwiń'}
            </span>
          </div>
        </div>
        
        {isExpanded && (
          <div className="mt-5 pt-5 border-t border-white/[0.08] flex flex-col gap-4">
            {isParent ? (
              teens.map(teen => {
                const stats = calculateStats(teen.id, data.tasks, teen)
                return (
                  <div key={teen.id} className="flex justify-between items-center">
                    <div>
                      <span className="font-bold text-sm text-[#F7F4EB]">{teen.name}</span>
                      <div className="text-[10px] text-[#F7F4EB]/65 mt-1">
                        Skuteczność: <span className={stats.hasBonus ? 'text-[#F7F4EB]' : ''}>{stats.successRate}%</span> | Ekstra: {stats.extraEarned} zł
                      </div>
                    </div>
                    <span className="font-bold text-lg text-[#F7F4EB]">{stats.totalPayout.toFixed(0)} zł</span>
                  </div>
                )
              })
            ) : (
              (() => {
                const stats = calculateStats(user.id, data.tasks, user)
                return (
                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-xs text-[#F7F4EB]/65 uppercase tracking-wide">Suma zarobków</span>
                      <span className="font-bold text-xl text-[#F7F4EB]">{stats.totalPayout.toFixed(0)} zł</span>
                    </div>
                    <div className="flex justify-between text-xs text-[#F7F4EB]/65 mb-2">
                      <span>Baza + Bonus</span>
                      <span className="text-[#F7F4EB]">{stats.currentBaseEarned.toFixed(0)} zł {stats.hasBonus ? `+ ${stats.bonusAllowance} zł` : ''}</span>
                    </div>
                    <div className="flex justify-between text-xs text-[#F7F4EB]/65 mb-6">
                      <span>Zadania ekstra</span>
                      <span className="text-[#F7F4EB]">+{stats.extraEarned} zł</span>
                    </div>
                    <h4 className="text-[10px] font-bold text-[#F7F4EB]/50 uppercase tracking-widest mb-3">Zadania</h4>
                    <div className="flex flex-col">
                      {data.tasks.filter(t => t.assignee_id === user.id).map(task => (
                        <div key={task.id} className="flex justify-between items-center py-3 border-b border-white/[0.06] last:border-0">
                          <div>
                            <p className="text-sm font-semibold text-[#F7F4EB]">{task.title}</p>
                            <p className="text-[10px] text-[#F7F4EB]/65 mt-1">{new Date(task.due_date).toLocaleDateString()}</p>
                          </div>
                          <div className="text-right">
                            <span className={`text-[11px] font-medium ${getStatusClass(task.status)}`}>{translateStatus(task.status)}</span>
                            {task.reward > 0 && <p className="text-[10px] text-[#F7F4EB] mt-0.5">+{task.reward} zł</p>}
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
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#3A1C3B] via-[#1E0F24] to-[#120816] text-[#F7F4EB] pb-12 font-sans">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-8 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none transition-all duration-300">
          <div className="bg-[#120816]/80 backdrop-blur-[20px] border border-white/[0.12] text-[#F7F4EB] px-6 py-3 rounded-full shadow-2xl text-xs font-bold text-center w-auto max-w-sm">
            {toastMessage}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="px-6 py-5 flex justify-between items-center sticky top-0 z-40 bg-white/[0.02] backdrop-blur-[20px] border-b border-white/[0.08]">
        <div>
          <h1 className="text-sm font-bold tracking-widest uppercase text-[#F7F4EB]">
            {user.role === 'parent' ? 'Panel Rodzica' : `Cześć, ${user.name}`}
          </h1>
          <p className="text-[10px] text-[#F7F4EB]/65 font-medium tracking-widest mt-1">{currentMonthName}</p>
        </div>
        <button onClick={() => setUser(null)} className="text-[10px] uppercase tracking-widest font-bold text-[#F7F4EB]/80 bg-white/[0.06] hover:bg-white/[0.1] px-4 py-2 rounded-full transition-all duration-200 active:scale-95 border border-white/[0.08]">Wyloguj</button>
      </div>

      <div className="p-4 max-w-md mx-auto mt-2">
        {user.role === 'parent' ? (
          // --- WIDOK RODZICA ---
          <>
            <div className="flex bg-white/[0.04] p-1 rounded-2xl mb-6 border border-white/[0.08]">
              <button onClick={() => setParentTab('dashboard')} className={`flex-1 py-2.5 text-[11px] uppercase tracking-wider font-bold rounded-[14px] transition-all duration-200 ${parentTab === 'dashboard' ? 'bg-white/[0.12] text-[#F7F4EB] shadow-sm backdrop-blur-md' : 'text-[#F7F4EB]/60 hover:bg-white/[0.05]'}`}>Pulpit</button>
              <button onClick={() => setParentTab('tasks')} className={`flex-1 py-2.5 text-[11px] uppercase tracking-wider font-bold rounded-[14px] transition-all duration-200 ${parentTab === 'tasks' ? 'bg-white/[0.12] text-[#F7F4EB] shadow-sm backdrop-blur-md' : 'text-[#F7F4EB]/60 hover:bg-white/[0.05]'}`}>Planowanie</button>
              <button onClick={() => setParentTab('archive')} className={`flex-1 py-2.5 text-[11px] uppercase tracking-wider font-bold rounded-[14px] transition-all duration-200 ${parentTab === 'archive' ? 'bg-white/[0.12] text-[#F7F4EB] shadow-sm backdrop-blur-md' : 'text-[#F7F4EB]/60 hover:bg-white/[0.05]'}`}>Archiwum</button>
            </div>

            {parentTab === 'dashboard' && (
              <div className="transition-opacity duration-300">
                <div className="flex flex-col gap-4 mb-6">
                  {teens.map(teen => {
                    const stats = calculateStats(teen.id, tasks, teen)
                    const isExpanded = expandedTeenId === teen.id
                    const breakdown = getTeenTaskBreakdown(teen.id)
                    const teenAdHoc = tasks.filter(t => t.assignee_id === teen.id && t.reward > 0)

                    return (
                      <div key={teen.id} className="bg-white/[0.06] backdrop-blur-[20px] border border-white/[0.12] rounded-[24px] shadow-lg overflow-hidden transition-all duration-200">
                        <div 
                          onClick={() => setExpandedTeenId(isExpanded ? null : teen.id)}
                          className="p-6 cursor-pointer flex justify-between items-center active:scale-[0.99] transition-transform"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <h2 className="font-bold text-base text-[#F7F4EB]">{teen.name}</h2>
                              <span className="text-[9px] uppercase tracking-widest text-[#F7F4EB]/50 bg-white/[0.05] px-2 py-0.5 rounded-full">
                                {isExpanded ? 'Zwiń' : 'Szczegóły'}
                              </span>
                            </div>
                            <p className="text-xs text-[#F7F4EB]/65 mt-1">Skuteczność: <span className="font-bold text-[#F7F4EB]">{stats.successRate}%</span></p>
                          </div>
                          <div className="text-right">
                            <div className="text-2xl font-bold text-[#F7F4EB]">{stats.totalPayout.toFixed(0)} zł</div>
                          </div>
                        </div>

                        {/* Rozwijana ramka szczegółów planu dziecka */}
                        {isExpanded && (
                          <div className="px-6 pb-6 pt-2 border-t border-white/[0.08] flex flex-col gap-4">
                            <div>
                              <h3 className="text-[10px] uppercase tracking-widest font-bold text-[#F7F4EB]/50 mb-3">Struktura obowiązków bazowych</h3>
                              {Object.keys(breakdown).length === 0 ? (
                                <p className="text-xs text-[#F7F4EB]/50 py-1">Brak zaplanowanych obowiązków bazowych.</p>
                              ) : (
                                <div className="flex flex-col gap-2">
                                  {Object.entries(breakdown).map(([title, item]) => (
                                    <div key={title} className="flex justify-between items-center py-2 border-b border-white/[0.04] last:border-0">
                                      <div>
                                        <p className="text-xs font-semibold text-[#F7F4EB]">{title}</p>
                                        <p className="text-[10px] text-[#F7F4EB]/60 mt-0.5">Waga jednostkowa: {item.weight} pkt | Razem: {item.planned * item.weight} pkt</p>
                                      </div>
                                      <div className="text-right">
                                        <span className="text-xs font-bold text-[#F7F4EB]">{item.approved} / {item.planned}</span>
                                        <span className="text-[10px] text-[#F7F4EB]/50 block">zrobione</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            <div>
                              <h3 className="text-[10px] uppercase tracking-widest font-bold text-[#F7F4EB]/50 mb-2">Zadania Ad-hoc (Giełda)</h3>
                              {teenAdHoc.length === 0 ? (
                                <p className="text-xs text-[#F7F4EB]/50 py-1">Brak podjętych zadań ekstra.</p>
                              ) : (
                                <div className="flex flex-col gap-1.5">
                                  {teenAdHoc.map(t => (
                                    <div key={t.id} className="flex justify-between items-center py-1.5 text-xs">
                                      <span className="text-[#F7F4EB]/80">{t.title}</span>
                                      <span className="font-semibold text-[#F7F4EB]">+{t.reward} zł ({translateStatus(t.status)})</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                <div className="bg-white/[0.06] backdrop-blur-[20px] border border-white/[0.12] p-6 rounded-[24px] shadow-lg mb-6">
                  <h2 className="font-bold text-[#F7F4EB] mb-5 text-[11px] tracking-widest uppercase">Budżety miesięczne</h2>
                  <div className="flex flex-col gap-5">
                    {teens.map(teen => (
                      <div key={teen.id} className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-[10px] uppercase tracking-wide text-[#F7F4EB]/65 mb-2 block">{teen.name} - Baza (zł)</label>
                          <input type="number" value={budgets[teen.id]?.base ?? teen.base_allowance} onChange={e => handleBudgetChange(teen.id, 'base', e.target.value)} className="w-full bg-white/[0.04] border border-white/[0.08] text-[#F7F4EB] rounded-xl p-3 text-sm focus:outline-none focus:border-white/[0.2] transition-colors" />
                        </div>
                        <div>
                          <label className="text-[10px] uppercase tracking-wide text-[#F7F4EB]/65 mb-2 block">Bonus &gt;90%</label>
                          <input type="number" value={budgets[teen.id]?.bonus ?? teen.bonus_allowance} onChange={e => handleBudgetChange(teen.id, 'bonus', e.target.value)} className="w-full bg-white/[0.04] border border-white/[0.08] text-[#F7F4EB] rounded-xl p-3 text-sm focus:outline-none focus:border-white/[0.2] transition-colors" />
                        </div>
                      </div>
                    ))}
                    <button onClick={handleSaveBudgets} className="w-full bg-white/[0.1] border border-white/[0.12] hover:bg-white/[0.15] text-[#F7F4EB] text-[11px] uppercase tracking-widest py-4 rounded-[16px] font-bold active:scale-[0.97] transition-all duration-200 mt-2">Zapisz Budżety</button>
                  </div>
                </div>

                <div className="bg-white/[0.06] backdrop-blur-[20px] border border-white/[0.12] p-6 rounded-[24px] shadow-lg mb-6">
                  <h2 className="font-bold text-[#F7F4EB] mb-4 text-[11px] tracking-widest uppercase flex justify-between items-center">
                    Oczekujące na zatwierdzenie
                    <span className="bg-white/[0.1] text-[#F7F4EB] text-[10px] px-2 py-1 rounded-lg">{tasks.filter(t => t.status === 'waiting_approval').length}</span>
                  </h2>
                  <div className="flex flex-col">
                    {tasks.filter(t => t.status === 'waiting_approval').map(task => (
                      <div key={task.id} className="flex justify-between items-center py-4 border-b border-white/[0.08] last:border-0">
                        <div>
                          <p className="font-semibold text-sm text-[#F7F4EB]">{task.title} <span className="text-xs text-[#F7F4EB]/50 font-normal">({task.profiles?.name || 'Ktoś'})</span></p>
                          <p className="text-[10px] text-[#F7F4EB]/65 mt-1">{formatTaskTime(task.start_date, task.due_date)}</p>
                          {task.reward > 0 && <span className="text-[10px] font-medium text-[#F7F4EB] mt-1 inline-block">Ekstra: {task.reward} zł</span>}
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => handleParentApproval(task.id, 'approved')} className="bg-white/[0.1] hover:bg-white/[0.15] border border-white/[0.12] text-[#F7F4EB] text-xs px-4 py-2 rounded-[12px] font-bold active:scale-[0.97] transition-all duration-200">Tak</button>
                          <button onClick={() => handleParentApproval(task.id, 'failed')} className="bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-[#F7F4EB]/80 text-xs px-4 py-2 rounded-[12px] font-bold active:scale-[0.97] transition-all duration-200">Nie</button>
                        </div>
                      </div>
                    ))}
                    {tasks.filter(t => t.status === 'waiting_approval').length === 0 && <p className="text-xs text-[#F7F4EB]/50 text-center py-4">Brak zadań do sprawdzenia.</p>}
                  </div>
                </div>
              </div>
            )}

            {parentTab === 'tasks' && (
              <div className="transition-opacity duration-300">
                
                {/* Zwijana sekcja planowania zadań */}
                <div className="bg-white/[0.06] backdrop-blur-[20px] border border-white/[0.12] rounded-[24px] shadow-lg mb-6 overflow-hidden transition-all duration-200">
                  <div 
                    onClick={() => setIsPlannerOpen(!isPlannerOpen)}
                    className="p-5 flex justify-between items-center cursor-pointer active:scale-[0.99] transition-transform"
                  >
                    <div>
                      <h2 className="font-bold text-[#F7F4EB] text-xs tracking-widest uppercase">
                        {editingTaskId ? 'Edytuj zadanie' : 'Zaplanuj zadania'}
                      </h2>
                      <p className="text-[10px] text-[#F7F4EB]/60 mt-0.5">
                        {isPlannerOpen ? 'Kliknij, aby zwinąć formularz' : 'Kliknij, aby rozwinąć kreator'}
                      </p>
                    </div>
                    <span className="text-xs text-[#F7F4EB]/60 bg-white/[0.06] px-3 py-1.5 rounded-full border border-white/[0.08]">
                      {isPlannerOpen ? 'Zwiń' : '+ Otwórz'}
                    </span>
                  </div>

                  {isPlannerOpen && (
                    <div className="px-6 pb-6 pt-2 border-t border-white/[0.08]">
                      {!editingTaskId && (
                        <div className="flex bg-white/[0.04] p-1 rounded-2xl mb-5 border border-white/[0.08]">
                          <button onClick={() => { setTaskMode('base'); setAssigneeId(teens[0]?.id); }} className={`flex-1 py-2 text-[11px] uppercase tracking-wider font-bold rounded-[14px] transition-all duration-200 ${taskMode === 'base' ? 'bg-white/[0.12] text-[#F7F4EB] shadow-sm backdrop-blur-md' : 'text-[#F7F4EB]/60 hover:bg-white/[0.05]'}`}>Obowiązki</button>
                          <button onClick={() => { setTaskMode('extra'); setAssigneeId('all'); }} className={`flex-1 py-2 text-[11px] uppercase tracking-wider font-bold rounded-[14px] transition-all duration-200 ${taskMode === 'extra' ? 'bg-white/[0.12] text-[#F7F4EB] shadow-sm backdrop-blur-md' : 'text-[#F7F4EB]/60 hover:bg-white/[0.05]'}`}>Ekstra płatne</button>
                        </div>
                      )}

                      <form onSubmit={handleSaveTask} className="flex flex-col gap-5">
                        <div className="grid grid-cols-2 gap-4">
                          <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)} className="w-full min-w-0 text-ellipsis overflow-hidden bg-white/[0.04] border border-white/[0.08] text-[#F7F4EB] p-3 rounded-xl text-sm outline-none focus:border-white/[0.2] transition-colors">
                            {taskMode === 'extra' && <option value="all" className="bg-[#1E0F24]">Tablica (Giełda)</option>}
                            {teens.map(t => <option key={t.id} value={t.id} className="bg-[#1E0F24]">{t.name}</option>)}
                          </select>

                          {taskMode === 'base' && !editingTaskId && (
                            <select value={taskTemplate} onChange={e => setTaskTemplate(e.target.value)} className="w-full min-w-0 text-ellipsis overflow-hidden bg-white/[0.04] border border-white/[0.08] text-[#F7F4EB] p-3 rounded-xl text-sm outline-none focus:border-white/[0.2] transition-colors">
                              {Object.keys(TEMPLATES).map(key => <option key={key} value={key} className="bg-[#1E0F24]">{TEMPLATES[key].title}</option>)}
                            </select>
                          )}
                        </div>

                        {(taskTemplate === 'custom' || taskMode === 'extra' || editingTaskId) && (
                          <div className="flex flex-col gap-4">
                            <input type="text" placeholder="Opisz zadanie..." value={customTitle} onChange={e => setCustomTitle(e.target.value)} className="bg-white/[0.02] border-b border-white/[0.12] text-[#F7F4EB] placeholder-[#F7F4EB]/40 p-3 text-sm focus:border-white/[0.3] outline-none transition-colors" />
                            
                            {taskMode === 'extra' ? (
                              <div>
                                <label className="text-[10px] uppercase tracking-wide text-[#F7F4EB]/65 mb-2 block">Nagroda finansowa (zł)</label>
                                <input type="number" min="1" value={bountyReward} onChange={e => setBountyReward(e.target.value)} className="w-full bg-white/[0.04] border border-white/[0.08] text-[#F7F4EB] p-3 rounded-xl text-sm font-bold outline-none focus:border-white/[0.2] transition-colors" />
                              </div>
                            ) : (
                              <select value={customWeight} onChange={e => setCustomWeight(e.target.value)} className="bg-white/[0.04] border border-white/[0.08] text-[#F7F4EB] p-3 rounded-xl text-sm outline-none focus:border-white/[0.2] transition-colors">
                                <option value="1" className="bg-[#1E0F24]">1 pkt (Niska waga)</option>
                                <option value="2" className="bg-[#1E0F24]">2 pkt (Średnia waga)</option>
                                <option value="3" className="bg-[#1E0F24]">3 pkt (Wysoka waga)</option>
                              </select>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="text-[10px] uppercase tracking-wide text-[#F7F4EB]/65 mb-2 block">Początek</label>
                                <input type="datetime-local" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl p-2.5 text-xs text-[#F7F4EB] outline-none focus:border-white/[0.2]" />
                              </div>
                              <div>
                                <label className="text-[10px] uppercase tracking-wide text-[#F7F4EB]/65 mb-2 block">Termin</label>
                                <input type="datetime-local" value={dueDate} onChange={e => setDueDate(e.target.value)} className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl p-2.5 text-xs text-[#F7F4EB] outline-none focus:border-white/[0.2]" />
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Siatka kalendarza dostosowana do dni tygodnia */}
                        {taskMode === 'base' && taskTemplate !== 'custom' && !editingTaskId && (
                          <div className="mt-2">
                            <div className="text-[10px] uppercase tracking-wide text-[#F7F4EB]/65 mb-3">Wybierz dni realizacji ({currentMonthName})</div>
                            
                            {/* Nagłówki dni tygodnia */}
                            <div className="grid grid-cols-7 gap-1.5 mb-2 text-center text-[10px] font-bold text-[#F7F4EB]/50">
                              {WEEKDAYS_SHORT.map((wd, i) => (
                                <span key={wd} className={i >= 5 ? 'text-[#F7F4EB]/30' : ''}>{wd}</span>
                              ))}
                            </div>

                            {/* Prawdziwa siatka miesiąca z przesunięciem */}
                            <div className="grid grid-cols-7 gap-1.5 mb-4">
                              {Array.from({ length: firstDayOffset }).map((_, i) => (
                                <div key={`offset-${i}`} className="h-9"></div>
                              ))}
                              {daysArray.map(day => {
                                const isWeekend = isWeekendDay(day)
                                const isSelected = selectedDays.includes(day)
                                return (
                                  <button 
                                    key={day} 
                                    type="button" 
                                    onClick={() => toggleDay(day)} 
                                    className={`h-9 flex items-center justify-center text-xs rounded-xl border font-semibold transition-all duration-200 ${
                                      isSelected 
                                        ? 'bg-white/[0.2] text-[#F7F4EB] border-white/[0.3] shadow-sm' 
                                        : (isWeekend ? 'bg-white/[0.01] text-[#F7F4EB]/35 border-white/[0.03] hover:bg-white/[0.04]' : 'bg-white/[0.03] text-[#F7F4EB]/65 border-white/[0.06] hover:bg-white/[0.08]')
                                    }`}
                                  >
                                    {day}
                                  </button>
                                )
                              })}
                            </div>

                            <div className="flex gap-3 text-xs">
                              <button type="button" onClick={selectAllDays} className="bg-white/[0.06] border border-white/[0.08] hover:bg-white/[0.1] text-[#F7F4EB] px-4 py-2 rounded-xl font-medium active:scale-[0.97] transition-all">Wszystkie</button>
                              <button type="button" onClick={selectWeekdays} className="bg-white/[0.06] border border-white/[0.08] hover:bg-white/[0.1] text-[#F7F4EB] px-4 py-2 rounded-xl font-medium active:scale-[0.97] transition-all">Robocze</button>
                              <button type="button" onClick={() => setSelectedDays([])} className="text-[#F7F4EB]/40 px-2 py-2 underline text-[11px]">Wyczyść</button>
                            </div>
                          </div>
                        )}

                        <div className="flex gap-3 mt-4">
                          <button type="submit" className="flex-1 bg-white/[0.12] hover:bg-white/[0.18] border border-white/[0.15] text-[#F7F4EB] p-4 rounded-[16px] font-bold text-[11px] uppercase tracking-widest active:scale-[0.97] transition-all duration-200">
                            {editingTaskId ? 'Zapisz Zmiany' : (taskMode === 'extra' ? 'Wrzuć na Giełdę' : 'Dodaj Zadania')}
                          </button>
                          {editingTaskId && (
                            <button type="button" onClick={resetForm} className="bg-white/[0.04] border border-white/[0.08] px-6 rounded-[16px] text-[11px] uppercase tracking-widest font-bold active:scale-[0.97] text-[#F7F4EB]/70 hover:bg-white/[0.08] transition-all">
                              Anuluj
                            </button>
                          )}
                        </div>
                      </form>
                    </div>
                  )}
                </div>

                {/* Sekcja przeglądu zadań i sterownik kalendarza */}
                <div className="bg-white/[0.06] backdrop-blur-[20px] border border-white/[0.12] p-6 rounded-[24px] shadow-lg">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="font-bold text-[#F7F4EB] text-[11px] tracking-widest uppercase">Przegląd zadań</h2>
                    {calendarFilterDay !== null && (
                      <button 
                        onClick={() => setCalendarFilterDay(null)} 
                        className="text-[10px] uppercase font-bold text-[#F7F4EB]/70 bg-white/[0.08] px-2.5 py-1 rounded-full border border-white/[0.08]"
                      >
                        Pokaż cały miesiąc
                      </button>
                    )}
                  </div>

                  {/* Filtry selektorów */}
                  <div className="flex flex-col gap-3 mb-5">
                    <div className="grid grid-cols-2 gap-3">
                      <select value={filterTeen} onChange={e => setFilterTeen(e.target.value)} className="w-full min-w-0 text-ellipsis overflow-hidden bg-white/[0.04] border border-white/[0.08] text-[#F7F4EB] p-2.5 rounded-xl text-xs outline-none focus:border-white/[0.2] transition-colors">
                        <option value="all" className="bg-[#1E0F24]">Wszyscy wykonawcy</option>
                        {teens.map(t => <option key={t.id} value={t.id} className="bg-[#1E0F24]">{t.name}</option>)}
                      </select>
                      <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="w-full min-w-0 text-ellipsis overflow-hidden bg-white/[0.04] border border-white/[0.08] text-[#F7F4EB] p-2.5 rounded-xl text-xs outline-none focus:border-white/[0.2] transition-colors">
                        <option value="all" className="bg-[#1E0F24]">Wszystkie statusy</option>
                        <option value="pending" className="bg-[#1E0F24]">Do zrobienia</option>
                        <option value="waiting_approval" className="bg-[#1E0F24]">Czekają</option>
                        <option value="approved" className="bg-[#1E0F24]">Zatwierdzone</option>
                        <option value="failed" className="bg-[#1E0F24]">Niewykonane</option>
                      </select>
                    </div>
                    <select value={filterType} onChange={e => setFilterType(e.target.value)} className="w-full min-w-0 text-ellipsis overflow-hidden bg-white/[0.04] border border-white/[0.08] text-[#F7F4EB] p-2.5 rounded-xl text-xs outline-none focus:border-white/[0.2] transition-colors">
                      <option value="all" className="bg-[#1E0F24]">Wszystkie typy zadań</option>
                      {uniqueTaskTypes.map(type => (
                        <option key={type} value={type} className="bg-[#1E0F24]">{type}</option>
                      ))}
                    </select>
                  </div>

                  {/* Dyskretny Kalendarz Sterujący nad listą */}
                  <div className="bg-white/[0.03] border border-white/[0.06] p-3 rounded-2xl mb-6">
                    <div className="grid grid-cols-7 gap-1 text-center text-[9px] font-bold text-[#F7F4EB]/40 mb-1.5">
                      {WEEKDAYS_SHORT.map((wd, i) => (
                        <span key={wd} className={i >= 5 ? 'text-[#F7F4EB]/25' : ''}>{wd}</span>
                      ))}
                    </div>

                    <div className="grid grid-cols-7 gap-1">
                      {Array.from({ length: firstDayOffset }).map((_, i) => (
                        <div key={`cal-offset-${i}`} className="h-8"></div>
                      ))}
                      {daysArray.map(day => {
                        const hasTasks = daysWithTasksSet.has(day)
                        const isSelected = calendarFilterDay === day
                        const isWeekend = isWeekendDay(day)

                        return (
                          <button
                            key={`cal-day-${day}`}
                            type="button"
                            onClick={() => setCalendarFilterDay(isSelected ? null : day)}
                            className={`h-8 flex flex-col items-center justify-center rounded-lg text-xs relative transition-all duration-200 ${
                              isSelected 
                                ? 'bg-white/[0.2] text-[#F7F4EB] font-bold border border-white/[0.2]' 
                                : (isWeekend ? 'text-[#F7F4EB]/40 hover:bg-white/[0.05]' : 'text-[#F7F4EB]/75 hover:bg-white/[0.05]')
                            }`}
                          >
                            <span>{day}</span>
                            {hasTasks && (
                              <span className={`w-1 h-1 rounded-full mt-0.5 ${isSelected ? 'bg-[#F7F4EB]' : 'bg-[#F7F4EB]/50'}`}></span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Lista zadań wg filtrów */}
                  <div className="flex flex-col">
                    {filteredParentTasks.length === 0 ? (
                      <p className="text-xs text-[#F7F4EB]/50 text-center py-6">Brak zadań w wybranym filtrze.</p>
                    ) : (
                      filteredParentTasks.map(task => (
                        <div key={task.id} className="flex justify-between items-center py-4 border-b border-white/[0.08] last:border-0">
                          <div className="flex-1 pr-4">
                            <p className="font-semibold text-sm text-[#F7F4EB]">{task.title} <span className="font-normal text-[11px] text-[#F7F4EB]/50">({task.assignee_id ? task.profiles?.name : 'Giełda'})</span></p>
                            <p className="text-[10px] text-[#F7F4EB]/65 mt-1 mb-1.5">{formatTaskTime(task.start_date, task.due_date)}</p>
                            <span className={`text-[11px] font-medium mr-3 ${getStatusClass(task.status)}`}>{translateStatus(task.status)}</span>
                            {task.reward > 0 ? (
                              <span className="text-[11px] font-medium text-[#F7F4EB] inline-block">+{task.reward} zł</span>
                            ) : (
                              <span className="text-[11px] font-medium text-[#F7F4EB]/65 inline-block">{task.weight} pkt</span>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => handleEditClick(task)} className="text-[#F7F4EB]/80 bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.1] px-3 py-2 rounded-[10px] text-xs font-medium transition-all duration-200">Edytuj</button>
                            <button onClick={() => handleDeleteTask(task.id)} className="text-[#F7F4EB]/60 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] px-3 py-2 rounded-[10px] text-xs font-medium transition-all duration-200">Usuń</button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {parentTab === 'archive' && (
              <div className="transition-opacity duration-300">
                <h2 className="font-bold text-[#F7F4EB] mb-5 text-[11px] tracking-widest uppercase px-2">Archiwum (12 miesięcy)</h2>
                {historyTasks.length === 0 ? (
                   <p className="text-sm text-[#F7F4EB]/50 text-center mt-10">Brak starszych danych.</p>
                ) : (
                  groupTasksByMonth(historyTasks).map(([monthKey, data]) => (
                    <HistoryCard key={monthKey} monthKey={monthKey} data={data} isParent={true} />
                  ))
                )}
              </div>
            )}
          </>
        ) : (
          // --- WIDOK NASTOLATKA (BEZ ZMIAN W ARCHITEKTURZE) ---
          <>
            {(() => {
              const stats = calculateStats(user.id, tasks, user)
              const bountyBoardTasks = tasks.filter(t => !t.assignee_id && t.status === 'pending')
              
              let displayedTeenTasks = tasks.filter(t => t.assignee_id === user.id)
              if (teenFilterStatus === 'evaluated') {
                 displayedTeenTasks = displayedTeenTasks.filter(t => t.reward === 0 && (t.status !== 'pending' || new Date(t.due_date) < now))
              } else if (teenFilterStatus !== 'all') {
                 displayedTeenTasks = displayedTeenTasks.filter(t => t.status === teenFilterStatus)
              }

              return (
                <>
                  <div 
                    onClick={handleStatsClick}
                    className="cursor-pointer bg-white/[0.06] backdrop-blur-[20px] border border-white/[0.12] p-7 rounded-[24px] shadow-lg mb-6 active:scale-[0.98] transition-all duration-200"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <h2 className="text-[10px] font-bold text-[#F7F4EB]/65 uppercase tracking-widest">Prognoza wypłaty</h2>
                      <span className="text-[9px] uppercase tracking-widest font-medium bg-white/[0.08] px-2.5 py-1 rounded-full text-[#F7F4EB]/80">Sprawdź ocenę</span>
                    </div>
                    <div className="text-5xl font-bold text-[#F7F4EB] mb-6">
                      {stats.totalPayout.toFixed(0)} <span className="text-2xl font-medium text-[#F7F4EB]/70">zł</span>
                    </div>
                    
                    <div className="w-full bg-white/[0.08] rounded-full h-1.5 overflow-hidden">
                      <div className="h-full bg-[#F7F4EB] rounded-full transition-all duration-1000 ease-out" style={{ width: `${Math.min(stats.successRate, 100)}%` }}></div>
                    </div>
                    <div className="flex justify-between text-[10px] uppercase tracking-wide text-[#F7F4EB]/65 mt-3 font-medium">
                      <span>Skuteczność: <span className="text-[#F7F4EB] font-bold">{stats.successRate}%</span></span>
                      <span>Cel bonusu: &gt;90%</span>
                    </div>
                  </div>

                  <div className="flex overflow-x-auto bg-white/[0.04] border border-white/[0.08] p-1 rounded-2xl mb-6 gap-1 hide-scrollbar">
                    <button onClick={() => setTeenTab('active')} className={`flex-1 min-w-[70px] py-2.5 text-[11px] uppercase tracking-wider font-bold rounded-[14px] transition-all duration-200 ${teenTab === 'active' ? 'bg-white/[0.12] text-[#F7F4EB] shadow-sm backdrop-blur-md' : 'text-[#F7F4EB]/60 hover:bg-white/[0.05]'}`}>Zadania</button>
                    <button onClick={() => setTeenTab('bounty')} className={`flex-1 min-w-[70px] py-2.5 text-[11px] uppercase tracking-wider font-bold rounded-[14px] transition-all duration-200 ${teenTab === 'bounty' ? 'bg-white/[0.12] text-[#F7F4EB] shadow-sm backdrop-blur-md' : 'text-[#F7F4EB]/60 hover:bg-white/[0.05]'}`}>
                      Giełda {bountyBoardTasks.length > 0 && <span className="bg-[#F7F4EB] text-[#120816] px-1.5 py-0.5 rounded-full text-[9px] ml-1.5">{bountyBoardTasks.length}</span>}
                    </button>
                    <button onClick={() => setTeenTab('wallet')} className={`flex-1 min-w-[70px] py-2.5 text-[11px] uppercase tracking-wider font-bold rounded-[14px] transition-all duration-200 ${teenTab === 'wallet' ? 'bg-white/[0.12] text-[#F7F4EB] shadow-sm backdrop-blur-md' : 'text-[#F7F4EB]/60 hover:bg-white/[0.05]'}`}>Portfel</button>
                    <button onClick={() => setTeenTab('archive')} className={`flex-1 min-w-[70px] py-2.5 text-[11px] uppercase tracking-wider font-bold rounded-[14px] transition-all duration-200 ${teenTab === 'archive' ? 'bg-white/[0.12] text-[#F7F4EB] shadow-sm backdrop-blur-md' : 'text-[#F7F4EB]/60 hover:bg-white/[0.05]'}`}>Historia</button>
                  </div>

                  {teenTab === 'wallet' && (
                    <div className="bg-white/[0.06] backdrop-blur-[20px] border border-white/[0.12] p-6 rounded-[24px] shadow-lg transition-opacity duration-300">
                      <h2 className="font-bold text-[#F7F4EB] mb-6 tracking-widest text-[11px] uppercase">Rozliczenie miesiąca</h2>
                      <div className="flex flex-col text-sm">
                        <div className="flex justify-between py-4 border-b border-white/[0.06]">
                          <span className="text-[#F7F4EB]/65">Baza (max)</span><span className="font-bold text-[#F7F4EB]">{stats.maxPoints > 0 ? user.base_allowance : 0} zł</span>
                        </div>
                        <div className="flex justify-between py-4 border-b border-white/[0.06]">
                          <span className="text-[#F7F4EB]/65">Z bazy ({stats.successRate}%)</span><span className="font-bold text-[#F7F4EB]">+{stats.currentBaseEarned.toFixed(0)} zł</span>
                        </div>
                        <div className="flex justify-between py-4 border-b border-white/[0.06]">
                          <span className="text-[#F7F4EB]/65">Premia &gt; 90%</span><span className={`font-bold ${stats.hasBonus ? 'text-[#F7F4EB]' : 'text-[#F7F4EB]/40'}`}>{stats.hasBonus ? `+${stats.bonusAllowance} zł` : '0 zł'}</span>
                        </div>
                        <div className="flex justify-between py-4 border-b border-white/[0.06]">
                          <span className="text-[#F7F4EB]/65">Zadania Ekstra (Giełda)</span><span className="font-bold text-[#F7F4EB]">+{stats.extraEarned.toFixed(0)} zł</span>
                        </div>
                        <div className="flex justify-between py-5 mt-2">
                          <span className="font-bold text-[#F7F4EB] uppercase tracking-wider text-xs">Do wypłaty</span><span className="font-bold text-[#F7F4EB] text-xl">{stats.totalPayout.toFixed(0)} zł</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {teenTab === 'bounty' && (
                    <div className="bg-white/[0.06] backdrop-blur-[20px] border border-white/[0.12] p-6 rounded-[24px] shadow-lg transition-opacity duration-300">
                      <h2 className="font-bold text-[#F7F4EB] mb-5 tracking-widest text-[11px] uppercase">Tablica Ogłoszeń</h2>
                      <div className="flex flex-col">
                        {bountyBoardTasks.length === 0 && <p className="text-xs text-[#F7F4EB]/50 text-center py-6">Brak ofert. Zajrzyj później.</p>}
                        {bountyBoardTasks.map(task => (
                          <div key={task.id} className="py-5 border-b border-white/[0.08] last:border-0 flex flex-col gap-4">
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="font-bold text-base text-[#F7F4EB]">{task.title}</p>
                                <p className="text-[10px] text-[#F7F4EB]/65 mt-1">{formatTaskTime(task.start_date, task.due_date)}</p>
                              </div>
                              <div className="text-[#F7F4EB] font-bold text-lg">
                                +{task.reward} zł
                              </div>
                            </div>
                            <button onClick={() => handleClaimBounty(task.id)} className="w-full bg-white/[0.12] hover:bg-white/[0.18] text-[#F7F4EB] border border-white/[0.15] font-bold py-3.5 rounded-[16px] text-[11px] uppercase tracking-widest active:scale-[0.98] transition-all duration-200">
                              Podejmuję się
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {teenTab === 'active' && (
                    <div className="bg-white/[0.06] backdrop-blur-[20px] border border-white/[0.12] p-6 rounded-[24px] shadow-lg transition-opacity duration-300">
                      <div className="mb-5">
                        <select 
                          value={teenFilterStatus} 
                          onChange={e => setTeenFilterStatus(e.target.value)} 
                          className="w-full bg-white/[0.04] border border-white/[0.08] text-[#F7F4EB] p-3 rounded-xl text-xs outline-none focus:border-white/[0.2] transition-colors"
                        >
                          <option value="all" className="bg-[#1E0F24]">Wszystkie zadania</option>
                          <option value="evaluated" className="bg-[#1E0F24]">Wpływające na wynik (%)</option>
                          <option value="pending" className="bg-[#1E0F24]">Do zrobienia</option>
                          <option value="waiting_approval" className="bg-[#1E0F24]">Czekają na akceptację</option>
                          <option value="approved" className="bg-[#1E0F24]">Zatwierdzone</option>
                          <option value="failed" className="bg-[#1E0F24]">Niewykonane</option>
                        </select>
                      </div>

                      <div className="flex flex-col">
                        {displayedTeenTasks.length === 0 && <p className="text-xs text-[#F7F4EB]/50 text-center py-6">Brak zadań pasujących do filtra.</p>}
                        {displayedTeenTasks.map(task => {
                          const isFuture = task.start_date ? new Date(task.start_date) > new Date() : false
                          const isBounty = task.reward > 0

                          return (
                            <div key={task.id} className={`py-4 border-b flex justify-between items-center transition-opacity duration-200 ${isFuture ? 'opacity-50 border-white/[0.04]' : 'border-white/[0.08] last:border-0'}`}>
                              <div className="flex-1 pr-4">
                                <p className={`font-semibold text-sm ${isFuture ? 'text-[#F7F4EB]/70' : 'text-[#F7F4EB]'}`}>{task.title}</p>
                                <p className="text-[10px] text-[#F7F4EB]/65 mt-1 mb-1.5">{formatTaskTime(task.start_date, task.due_date)}</p>
                                <span className={`text-[11px] font-medium mr-3 ${getStatusClass(task.status)}`}>{translateStatus(task.status)}</span>
                                {isBounty ? (
                                  <span className="text-[11px] font-medium text-[#F7F4EB] inline-block">+{task.reward} zł</span>
                                ) : (
                                  <span className="text-[11px] font-medium text-[#F7F4EB]/65 inline-block">{task.weight} pkt</span>
                                )}
                              </div>
                              <div>
                                {task.status === 'pending' && (
                                  <button 
                                    onClick={() => { if (isFuture) showToast(`Aktywne od: ${formatFutureTime(task.start_date)}`); else handleTeenAction(task.id, 'waiting_approval'); }}
                                    className={`text-[10px] uppercase tracking-widest px-4 py-2.5 rounded-[12px] font-bold transition-all duration-200 ${isFuture ? 'bg-white/[0.04] text-[#F7F4EB]/50 border border-white/[0.08]' : 'bg-white/[0.12] hover:bg-white/[0.18] text-[#F7F4EB] border border-white/[0.15] active:scale-[0.95]'}`}
                                  >
                                    {isFuture ? 'Za wcześnie' : 'Zrobione'}
                                  </button>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {teenTab === 'archive' && (
                    <div className="transition-opacity duration-300">
                       {historyTasks.length === 0 ? (
                         <p className="text-sm text-[#F7F4EB]/50 text-center mt-10">Brak starszych danych.</p>
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
