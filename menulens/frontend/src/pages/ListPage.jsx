import { useApp } from '../AppContext'
import MyMealsPanel from '../components/MyMealsPanel'

function ListPage() {
  const { userId, pendingVisits, saveVisit, removePending } = useApp()

  return (
    <div className="container-narrow">
      <div className="page-head">
        <h1>My List</h1>
        <p>Every restaurant visit you have logged, and the dishes you rated.</p>
      </div>

      <MyMealsPanel
        userId={userId}
        pendingVisits={pendingVisits}
        onSaveVisit={saveVisit}
        onRemovePending={removePending}
      />
    </div>
  )
}

export default ListPage
