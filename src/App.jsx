import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import MainLayout from "./Layout/MainLayout";
import Login from "./pages/Login";
import Onboarding from "./pages/Onboarding";
import CRM from "./pages/CRM";
import ProjectEstimate from "./pages/ProjectEstimate";
import EstimateStart from "./pages/EstimateStart";
import QuotePDF from "./pages/QuotePDF";
import FieldReport from "./pages/FieldReport";
import EstimateSearch from "./pages/EstimateSearch";
import HowToUse from "./pages/HowToUse";
import CustomerProfile from "./pages/CustomerProfile";
import Settings from "./pages/Settings";
import QuotePricing from "./pages/QuotePricing";
import EstimateDrawings from "./pages/EstimateDrawings";
import ResetPassword from "./pages/ResetPassword";
import HersEstimate from "./pages/HersEstimate";
import BoardPlasterEstimate from "./pages/BoardPlasterEstimate";
import BoardPlasterSearch from "./pages/BoardPlasterSearch";
import HersSearch from "./pages/HersSearch";
import HersInvoice from "./pages/HersInvoice";
import HersInvoiceSearch from "./pages/HersInvoiceSearch";
import HersFieldMeasurements from "./pages/HersFieldMeasurements";
import EkotropeReport from "./pages/EkotropeReport";
import JobStart from "./pages/JobStart";
import Projects from "./pages/Projects";
import Schedule from "./pages/Schedule";


function Dashboard() {
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",
      height:"100%",minHeight:"80vh",fontFamily:"Inter,system-ui,sans-serif"}}>
      <div style={{textAlign:"center",color:"#94a3b8"}}>
        <div style={{fontSize:48,marginBottom:16}}>🏠</div>
        <div style={{fontSize:22,fontWeight:700,color:"#0f172a",marginBottom:8}}>
          NEX
        </div>
        <div style={{fontSize:14}}>Select an option from the menu</div>
      </div>
    </div>
  );
}
function Jobs()      { return <Navigate to="/estimates/search" replace />; }

function ProtectedApp() {
  const { user, company, loading } = useAuth();
  const location = useLocation();

  if(loading) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center",
        justifyContent:"center", fontFamily:"system-ui", color:"#64748b" }}>
      Loading…
    </div>
  );

  if(!user) return <Navigate to="/login" replace />;

  // Don't redirect to onboarding while still loading or already on onboarding
  if(!company && !loading && location.pathname !== "/onboarding")
    return <Navigate to="/onboarding" replace />;

  // check trial/status
  if(company.status==="suspended") return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center",
        justifyContent:"center", fontFamily:"system-ui", padding:20, textAlign:"center" }}>
      <div>
        <div style={{ fontSize:40, marginBottom:12 }}>⚠️</div>
        <div style={{ fontSize:20, fontWeight:700, color:"#0f172a", marginBottom:8 }}>
          Account Suspended
        </div>
        <div style={{ fontSize:14, color:"#64748b" }}>
          Please contact support to reactivate your account.
        </div>
      </div>
    </div>
  );

  return (
    <Routes>
      <Route path="/" element={<MainLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="crm" element={<CRM />} />
        <Route path="jobs" element={<Jobs />} />
        <Route path="estimates/search" element={<EstimateSearch />} />
        <Route path="estimates" element={<EstimateStart />} />
        <Route path="job/new" element={<JobStart />} />
        <Route path="how-to-use" element={<HowToUse />} />
        <Route path="project/new" element={<ProjectEstimate />} />
        <Route path="project/:id" element={<ProjectEstimate />} />
        <Route path="quote/:projectId" element={<QuotePDF />} />
        <Route path="field-report/:projectId" element={<FieldReport />} />
        <Route path="customer/:customerId" element={<CustomerProfile />} />
        <Route path="settings" element={<Settings />} />
        <Route path="quote-pricing/:projectId" element={<QuotePricing />} />
        <Route path="project/drawings/:projectId" element={<EstimateDrawings />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/:customerId" element={<Projects />} />
        <Route path="schedule" element={<Schedule />} />
        <Route path="/hers/search" element={<HersSearch />} />
        <Route path="/hers/invoices" element={<HersInvoiceSearch />} />
        <Route path="/hers/invoice/:id" element={<HersInvoice />} />
        <Route path="/hers/measurements/:invoiceId" element={<HersFieldMeasurements />} />
        <Route path="/hers/measurements/estimate/:estimateId" element={<HersFieldMeasurements />} />
        <Route path="/hers/new" element={<HersEstimate />} />
        <Route path="/hers/:id" element={<HersEstimate />} />
        <Route path="/board-plaster/new" element={<BoardPlasterEstimate />} />
        <Route path="/board-plaster/search" element={<BoardPlasterSearch />} />
        <Route path="/board-plaster/:id" element={<BoardPlasterEstimate />} />
      </Route>

      {/* Print reports — outside MainLayout so they print without sidebar clipping */}
      <Route path="/hers/ekotrope/:invoiceId" element={<EkotropeReport />} />
      <Route path="/hers/ekotrope/estimate/:estimateId" element={<EkotropeReport />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/*" element={<ProtectedApp />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
