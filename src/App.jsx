import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import MainLayout from "./layout/MainLayout";
import Login from "./pages/Login";
import Onboarding from "./pages/Onboarding";
import CRM from "./pages/CRM";
import ProjectEstimate from "./pages/ProjectEstimate";
import EstimateStart from "./pages/EstimateStart";
import QuotePDF from "./pages/QuotePDF";
import FieldReport from "./pages/FieldReport";
import EstimateSearch from "./pages/EstimateSearch";
import HowToUse from "./pages/HowToUse";
import ResetPassword from "./pages/ResetPassword";

function Dashboard() { return <h2 style={{padding:20}}>Dashboard</h2>; }
function Jobs()      { return <h2 style={{padding:20}}>Jobs</h2>; }

function ProtectedApp() {
  const { user, company, loading } = useAuth();

  if(loading) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center",
        justifyContent:"center", fontFamily:"system-ui", color:"#64748b" }}>
      Loading…
    </div>
  );

if(!user) return <Navigate to="/login" replace />;

  // check trial/status
  if(company?.status==="suspended") return (
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
        <Route path="how-to-use" element={<HowToUse />} />
        <Route path="project/new" element={<ProjectEstimate />} />
        <Route path="project/:id" element={<ProjectEstimate />} />
        <Route path="quote/:projectId" element={<QuotePDF />} />
        <Route path="field-report/:projectId" element={<FieldReport />} />
      </Route>
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
