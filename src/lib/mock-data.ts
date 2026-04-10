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

export interface MockPatient {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  address: string | null;
  emergencyContact: string | null;
  medicalHistory: string | null;
  notes: string | null;
  doctorId: string;
  doctorName: string;
  branchId: string;
  lastVisit: string | null;
  totalVisits: number;
  totalXrays: number;
  status: "active" | "inactive";
  createdAt: string;
}

export const mockPatients: MockPatient[] = [
  {
    id: "pat_1",
    firstName: "John",
    lastName: "Doe",
    email: "john.doe@email.com",
    phone: "+60 12-345 6789",
    dateOfBirth: "1985-03-15",
    gender: "Male",
    address: "123 Jalan Ampang, Kuala Lumpur 50450",
    emergencyContact: "Jane Doe — +60 12-987 6543",
    medicalHistory: "Lower back pain (chronic), mild scoliosis diagnosed 2019",
    notes: "Prefers morning appointments. Allergic to latex.",
    doctorId: "user_1",
    doctorName: "Dr. James Miller",
    branchId: "branch_1",
    lastVisit: "2026-04-08",
    totalVisits: 12,
    totalXrays: 4,
    status: "active",
    createdAt: "2025-06-10",
  },
  {
    id: "pat_2",
    firstName: "Sarah",
    lastName: "Lim",
    email: "sarah.lim@email.com",
    phone: "+60 11-2233 4455",
    dateOfBirth: "1992-07-22",
    gender: "Female",
    address: "45 Jalan Bukit Bintang, Kuala Lumpur 55100",
    emergencyContact: "David Lim — +60 11-5566 7788",
    medicalHistory: "Cervical spine stiffness, tension headaches",
    notes: null,
    doctorId: "user_1",
    doctorName: "Dr. James Miller",
    branchId: "branch_1",
    lastVisit: "2026-04-10",
    totalVisits: 8,
    totalXrays: 2,
    status: "active",
    createdAt: "2025-09-03",
  },
  {
    id: "pat_3",
    firstName: "Ahmad",
    lastName: "Ibrahim",
    email: "ahmad.ib@email.com",
    phone: "+60 13-9876 5432",
    dateOfBirth: "1978-11-05",
    gender: "Male",
    address: "78 Jalan Tun Razak, Kuala Lumpur 50400",
    emergencyContact: "Siti Ibrahim — +60 13-1234 5678",
    medicalHistory: "Post-accident thoracic pain (MVA 2024), disc herniation L4-L5",
    notes: "Referred by Dr. Tan. Workers comp case.",
    doctorId: "user_1",
    doctorName: "Dr. James Miller",
    branchId: "branch_1",
    lastVisit: "2026-04-05",
    totalVisits: 20,
    totalXrays: 6,
    status: "active",
    createdAt: "2024-12-15",
  },
  {
    id: "pat_4",
    firstName: "Kevin",
    lastName: "Low",
    email: "kevin.low@email.com",
    phone: "+60 16-7788 9900",
    dateOfBirth: "2001-01-30",
    gender: "Male",
    address: "12 SS2, Petaling Jaya 47300",
    emergencyContact: "Michelle Low — +60 16-1122 3344",
    medicalHistory: "Sports injury — rotator cuff strain",
    notes: "University student athlete. Flexible schedule.",
    doctorId: "user_1",
    doctorName: "Dr. James Miller",
    branchId: "branch_1",
    lastVisit: "2026-03-28",
    totalVisits: 5,
    totalXrays: 1,
    status: "active",
    createdAt: "2026-01-20",
  },
  {
    id: "pat_5",
    firstName: "Priya",
    lastName: "Nair",
    email: "priya.nair@email.com",
    phone: "+60 17-5566 7788",
    dateOfBirth: "1990-09-12",
    gender: "Female",
    address: "90 Bangsar South, Kuala Lumpur 59200",
    emergencyContact: "Raj Nair — +60 17-9988 7766",
    medicalHistory: "Pregnancy-related lower back pain (2nd trimester)",
    notes: "Currently 24 weeks pregnant. No prone positions.",
    doctorId: "user_1",
    doctorName: "Dr. James Miller",
    branchId: "branch_1",
    lastVisit: "2026-04-09",
    totalVisits: 6,
    totalXrays: 0,
    status: "active",
    createdAt: "2026-02-01",
  },
  {
    id: "pat_6",
    firstName: "Tan",
    lastName: "Wei Ming",
    email: "weiming.tan@email.com",
    phone: "+60 18-3344 5566",
    dateOfBirth: "1965-04-18",
    gender: "Male",
    address: "33 Damansara Heights, Kuala Lumpur 50490",
    emergencyContact: "Tan Mei Ling — +60 18-7788 9900",
    medicalHistory: "Degenerative disc disease, osteoarthritis (lumbar)",
    notes: "Retired. Comes in every 2 weeks for maintenance.",
    doctorId: "user_1",
    doctorName: "Dr. James Miller",
    branchId: "branch_1",
    lastVisit: "2026-03-25",
    totalVisits: 30,
    totalXrays: 8,
    status: "active",
    createdAt: "2024-06-01",
  },
  {
    id: "pat_7",
    firstName: "Lisa",
    lastName: "Chen",
    email: "lisa.chen@email.com",
    phone: "+60 19-1122 3344",
    dateOfBirth: "1988-12-03",
    gender: "Female",
    address: "56 Mont Kiara, Kuala Lumpur 50480",
    emergencyContact: "Mark Chen — +60 19-5566 7788",
    medicalHistory: "Whiplash injury (2025), neck pain, limited ROM",
    notes: "Insurance case — AIA policy #WH-2025-9821",
    doctorId: "user_1",
    doctorName: "Dr. James Miller",
    branchId: "branch_1",
    lastVisit: "2026-04-02",
    totalVisits: 15,
    totalXrays: 3,
    status: "active",
    createdAt: "2025-04-10",
  },
  {
    id: "pat_8",
    firstName: "Razif",
    lastName: "Hassan",
    email: null,
    phone: "+60 14-8899 0011",
    dateOfBirth: "1975-06-25",
    gender: "Male",
    address: "22 Subang Jaya, Selangor 47500",
    emergencyContact: "Aminah Hassan — +60 14-2233 4455",
    medicalHistory: "Chronic sciatica, lumbar stenosis",
    notes: "No email on file. Prefers phone calls.",
    doctorId: "user_1",
    doctorName: "Dr. James Miller",
    branchId: "branch_1",
    lastVisit: "2026-01-15",
    totalVisits: 3,
    totalXrays: 2,
    status: "inactive",
    createdAt: "2025-11-08",
  },
];
