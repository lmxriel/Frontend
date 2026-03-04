import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Download } from "lucide-react";
import TopNavAdmin from "../../Components/Navigation/TopNavAdmin";
import LoadingModal from "../../Components/Modals/LoadingModal";
import { useAuth } from "../../Components/ServiceLayer/Context/authContext";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logo from "../../assets/Admin-Page-Image/OVSLogo.png";

function ReportPage() {
  const navigate = useNavigate();
  const [adoptionReports, setAdoptionReports] = useState([]);
  const [appointmentReports, setAppointmentReports] = useState([]);
  const [loadingPage, setLoadingPage] = useState(true);

  const [adoptionSearch, setAdoptionSearch] = useState("");
  const [appointmentSearch, setAppointmentSearch] = useState("");

  const [adoptionRange, setAdoptionRange] = useState({ from: "", to: "" });
  const [appointmentRange, setAppointmentRange] = useState({
    from: "",
    to: "",
  });

  const [adoptionStatusFilter, setAdoptionStatusFilter] = useState("All");
  const [appointmentStatusFilter, setAppointmentStatusFilter] = useState("All");

  const { apiClient, token, logout } = useAuth();

  const fetchAdoptionReports = async () => {
    try {
      setLoadingPage(true);
      const res = await apiClient.get("/report/adoption", {
        params: { from: adoptionRange.from, to: adoptionRange.to },
      });
      const adoptions = Array.isArray(res.data?.approvedAdoptions)
        ? res.data.approvedAdoptions
        : [];
      setAdoptionReports(adoptions);
    } catch (error) {
      console.error("Error fetching adoption reports:", error);
      setAdoptionReports([]);
    } finally {
      setLoadingPage(false);
    }
  };

  const fetchAppointmentReports = async () => {
    try {
      setLoadingPage(true);
      const res = await apiClient.get("/report/appointment", {
        params: { from: appointmentRange.from, to: appointmentRange.to },
      });
      const appointments = Array.isArray(res.data?.approvedAppointments)
        ? res.data.approvedAppointments
        : [];
      setAppointmentReports(appointments);
    } catch (error) {
      console.error("Error fetching appointment reports:", error);
      setAppointmentReports([]);
    } finally {
      setLoadingPage(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    Promise.all([fetchAdoptionReports(), fetchAppointmentReports()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const filteredAdoptions = adoptionReports.filter((report) => {
    const fullName =
      `${report.adopter_first_name || ""} ${report.adopter_last_name || ""}`.toLowerCase();
    const petName = (report.pet_name || "").toLowerCase();
    const petBreed = (report.pet_breed || "").toLowerCase();
    const petType = (report.pet_type || "").toLowerCase();
    const status = (report.status || "").toLowerCase();
    const purpose = (report.purpose_of_adoption || "").toLowerCase();
    const reason = (report.reasons || "").toLowerCase();
    const query = adoptionSearch.toLowerCase();

    const matchesSearch =
      fullName.includes(query) ||
      petName.includes(query) ||
      petBreed.includes(query) ||
      petType.includes(query) ||
      status.includes(query) ||
      purpose.includes(query) ||
      reason.includes(query);

    const matchesStatus =
      adoptionStatusFilter === "All" ||
      (report.status || "").toLowerCase() ===
        adoptionStatusFilter.toLowerCase();

    return matchesSearch && matchesStatus;
  });

  const filteredAppointments = appointmentReports.filter((a) => {
    const fullName = `${a.first_name || ""} ${a.last_name || ""}`.toLowerCase();
    const service = (a.appointment_type || "").toLowerCase();
    const status = (a.status || "").toLowerCase();
    const query = appointmentSearch.toLowerCase();

    const matchesSearch =
      fullName.includes(query) ||
      service.includes(query) ||
      status.includes(query);

    const matchesStatus =
      appointmentStatusFilter === "All" ||
      (a.status || "").toLowerCase() === appointmentStatusFilter.toLowerCase();

    return matchesSearch && matchesStatus;
  });

  const addPdfHeader = (doc, title) => {
    try {
      doc.addImage(logo, "PNG", 50, 12, 18, 18);
    } catch (e) {
      console.warn("Logo addImage error:", e);
    }
    doc.setFontSize(12);
    doc.text("Office of Veterinary Services", 105, 18, { align: "center" });
    doc.setFontSize(10);
    doc.text("City of Tacurong, Province of Sultan Kudarat", 105, 24, {
      align: "center",
    });
    doc.setFontSize(11);
    doc.text(title, 105, 34, { align: "center" });
  };

  const formatDate = (val) =>
    val
      ? new Date(val).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "N/A";

  const handleExportAdoptions = () => {
    const doc = new jsPDF("p", "mm", "a4");
    const filterLabel =
      adoptionStatusFilter !== "All" ? ` (${adoptionStatusFilter})` : "";
    addPdfHeader(doc, `Adoption Report${filterLabel}`);

    const columns = [
      "Adopter Name",
      "Pet Name",
      "Pet Breed",
      "Pet Type",
      "Reason",
      "Purpose",
      "Date Requested",
      "Date Adopted",
      "Status",
    ];
    const rows = filteredAdoptions.map((r) => [
      `${r.adopter_first_name || ""} ${r.adopter_last_name || ""}`.trim() ||
        "N/A",
      r.pet_name || "N/A",
      r.pet_breed || "N/A",
      r.pet_type || "N/A",
      r.reasons || "N/A",
      r.purpose_of_adoption || "N/A",
      formatDate(r.dateRequested),
      formatDate(r.dateAdopted),
      r.status || "Approved",
    ]);

    autoTable(doc, {
      head: [columns],
      body: rows,
      startY: 40,
      styles: { fontSize: 8 },
    });
    doc.save("adoption-report.pdf");
  };

  const handleExportAppointments = () => {
    const doc = new jsPDF("p", "mm", "a4");
    const filterLabel =
      appointmentStatusFilter !== "All" ? ` (${appointmentStatusFilter})` : "";
    addPdfHeader(doc, `Appointment Report${filterLabel}`);

    const columns = ["Owner Name", "Service", "Date", "Time", "Status"];
    const rows = filteredAppointments.map((a) => [
      `${a.first_name || ""} ${a.last_name || ""}`.trim(),
      a.appointment_type || "N/A",
      formatDate(a.appointment_date),
      a.timeSchedule
        ? new Date(`1970-01-01T${a.timeSchedule}`).toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          })
        : "N/A",
      a.status || "Accepted",
    ]);

    autoTable(doc, {
      head: [columns],
      body: rows,
      startY: 40,
      styles: { fontSize: 9 },
    });
    doc.save("appointment-report.pdf");
  };

  const StatusFilterButtons = ({ value, onChange, options }) => (
    <div className="flex gap-1">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            value === opt
              ? opt === "Approved" || opt === "Accepted"
                ? "bg-green-600 text-white"
                : opt === "Rejected"
                  ? "bg-red-600 text-white"
                  : "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );

  const getStatusBadge = (status) => {
    const s = (status || "").toLowerCase();
    if (s === "approved" || s === "accepted")
      return "bg-green-100 text-green-800";
    if (s === "rejected") return "bg-red-100 text-red-800";
    return "bg-gray-100 text-gray-700";
  };

  if (loadingPage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        <div className="flex flex-col items-center gap-6 p-8 animate-pulse">
          <div className="w-20 h-20 bg-blue-500/20 rounded-2xl flex items-center justify-center mb-4">
            <Loader2 className="h-16 w-16 text-blue-500 animate-spin drop-shadow-md" />
          </div>
          <div className="space-y-2 text-center">
            <div className="text-xl font-bold text-blue-900 tracking-wide">
              Generating Reports
            </div>
            <div className="text-lg text-blue-800/80">
              Loading analytics data...
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-screen-2xl mx-auto">
        <TopNavAdmin handleSignOut={logout} />

        <div className="px-6 mb-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-1">
              Reports Dashboard
            </h2>
            <p className="text-sm text-gray-600">
              View approved adoption and appointment reports
            </p>
          </div>
        </div>

        {/* ── Adoption Reports ── */}
        <div className="px-6 pb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-gray-900">
              Adoption Reports
            </h3>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder="Search by adopter, pet, reason, purpose, status..."
                value={adoptionSearch}
                onChange={(e) => setAdoptionSearch(e.target.value)}
                className="w-64 px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />

              {/* Status filter — between search and date pickers */}
              <div className="flex items-center gap-1">
                <span className="text-sm text-gray-500 font-medium">
                  Status:
                </span>
                <StatusFilterButtons
                  value={adoptionStatusFilter}
                  onChange={setAdoptionStatusFilter}
                  options={["All", "Approved", "Rejected"]}
                />
              </div>

              <input
                type="date"
                value={adoptionRange.from}
                onChange={(e) =>
                  setAdoptionRange({ ...adoptionRange, from: e.target.value })
                }
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <input
                type="date"
                value={adoptionRange.to}
                onChange={(e) =>
                  setAdoptionRange({ ...adoptionRange, to: e.target.value })
                }
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <button
                onClick={fetchAdoptionReports}
                className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
              >
                Filter
              </button>
              <button
                onClick={handleExportAdoptions}
                className="px-4 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 flex items-center text-sm"
              >
                <Download className="h-4 w-4 mr-1" /> Export
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-auto max-h-[300px]">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {[
                    "Adopter Name",
                    "Pet Name",
                    "Pet Breed",
                    "Pet Type",
                    "Reason",
                    "Purpose",
                    "Date Requested",
                    "Date Adopted",
                    "Status",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredAdoptions.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-6 py-12 text-center text-gray-500"
                    >
                      No adoption records found.
                    </td>
                  </tr>
                ) : (
                  filteredAdoptions.map((report, index) => (
                    <tr
                      key={report.adoption_id || index}
                      className="hover:bg-gray-50"
                    >
                      <td className="px-6 py-2">{`${report.adopter_first_name || ""} ${report.adopter_last_name || ""}`}</td>
                      <td className="px-6 py-2">{report.pet_name || "N/A"}</td>
                      <td className="px-6 py-2">{report.pet_breed || "N/A"}</td>
                      <td className="px-6 py-2">{report.pet_type || "N/A"}</td>
                      <td className="px-6 py-2">{report.reasons || "N/A"}</td>
                      <td className="px-6 py-2">
                        {report.purpose_of_adoption || "N/A"}
                      </td>
                      <td className="px-6 py-2 whitespace-nowrap">
                        {formatDate(report.dateRequested)}
                      </td>
                      <td className="px-6 py-2 whitespace-nowrap">
                        {formatDate(report.dateAdopted)}
                      </td>
                      <td className="px-6 py-2">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(report.status)}`}
                        >
                          {report.status || "Approved"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Appointment Reports ── */}
        <div className="px-6 pb-8">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-gray-900">
              Appointment Reports
            </h3>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder="Search by owner, service, status..."
                value={appointmentSearch}
                onChange={(e) => setAppointmentSearch(e.target.value)}
                className="w-64 px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />

              {/* Status filter — between search and date pickers */}
              <div className="flex items-center gap-1">
                <span className="text-sm text-gray-500 font-medium">
                  Status:
                </span>
                <StatusFilterButtons
                  value={appointmentStatusFilter}
                  onChange={setAppointmentStatusFilter}
                  options={["All", "Accepted", "Rejected"]}
                />
              </div>

              <input
                type="date"
                value={appointmentRange.from}
                onChange={(e) =>
                  setAppointmentRange({
                    ...appointmentRange,
                    from: e.target.value,
                  })
                }
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <input
                type="date"
                value={appointmentRange.to}
                onChange={(e) =>
                  setAppointmentRange({
                    ...appointmentRange,
                    to: e.target.value,
                  })
                }
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <button
                onClick={fetchAppointmentReports}
                className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
              >
                Filter
              </button>
              <button
                onClick={handleExportAppointments}
                className="px-4 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 flex items-center text-sm"
              >
                <Download className="h-4 w-4 mr-1" /> Export
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-auto max-h-[300px]">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {["Owner Name", "Service", "Date", "Time", "Status"].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredAppointments.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-12 text-center text-gray-500"
                    >
                      No appointment records found.
                    </td>
                  </tr>
                ) : (
                  filteredAppointments.map((appt) => (
                    <tr key={appt.appointment_id} className="hover:bg-gray-50">
                      <td className="px-6 py-2">{`${appt.first_name || ""} ${appt.last_name || ""}`}</td>
                      <td className="px-6 py-2">{appt.appointment_type}</td>
                      <td className="px-6 py-2 whitespace-nowrap">
                        {formatDate(appt.appointment_date)}
                      </td>
                      <td className="px-6 py-2 whitespace-nowrap">
                        {appt.timeSchedule
                          ? new Date(
                              `1970-01-01T${appt.timeSchedule}`,
                            ).toLocaleTimeString("en-US", {
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: true,
                            })
                          : "N/A"}
                      </td>
                      <td className="px-6 py-2">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(appt.status)}`}
                        >
                          {appt.status || "Accepted"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <LoadingModal isOpen={loadingPage} message="Loading reports..." />
    </div>
  );
}

export default ReportPage;
