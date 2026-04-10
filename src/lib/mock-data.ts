// Mock data for dashboard UI until database is implemented

export const currentUser = {
  id: "user_1",
  name: "Dr. James Miller",
  email: "james.miller@smartchiro.com",
  role: "OWNER" as const,
  image: null,
  branch: {
    id: "branch_1",
    name: "SmartChiro Health Center",
  },
};

export const dashboardStats = {
  totalPatients: { value: 1284, trend: "+10% from last month" },
  todaysVisits: { value: 24, note: "4 patients remaining" },
  revenueMTD: { value: 12450, note: "On track for target" },
  pendingInvoices: { value: 7, note: "3 high priority" },
};

export const todaysSchedule = [
  {
    id: "apt_1",
    patientName: "John Doe",
    patientImage: null,
    time: "09:30 AM",
    status: "CHECKED_IN" as const,
    service: "Adjustment",
  },
  {
    id: "apt_2",
    patientName: "Sarah Lim",
    patientImage: null,
    time: "10:15 AM",
    status: "SCHEDULED" as const,
    service: "Consultation",
  },
  {
    id: "apt_3",
    patientName: "Ahmad Ibrahim",
    patientImage: null,
    time: "11:00 AM",
    status: "COMPLETED" as const,
    service: "Follow Up",
  },
  {
    id: "apt_4",
    patientName: "Kevin Low",
    patientImage: null,
    time: "01:30 PM",
    status: "SCHEDULED" as const,
    service: "X-Ray",
  },
];

export const recentActivity = [
  {
    id: "act_1",
    description: "Dr. Smith annotated L-Spine for John Doe",
    timestamp: "2026-03-30T09:15:00Z",
  },
  {
    id: "act_2",
    description: "New invoice generated for Sarah Lim",
    timestamp: "2026-03-30T08:45:00Z",
  },
  {
    id: "act_3",
    description: "Patient intake form received from Ahmad Ibrahim",
    timestamp: "2026-03-30T08:30:00Z",
  },
  {
    id: "act_4",
    description: "System backup completed successfully",
    timestamp: "2026-03-30T07:00:00Z",
  },
];

export const quickViewXray = {
  id: "xray_1",
  title: "Last Radiology Image",
  patientName: "Jane Smith",
  bodyRegion: "Cervical Spine",
  imageUrl: "/placeholder-xray.jpg",
};
