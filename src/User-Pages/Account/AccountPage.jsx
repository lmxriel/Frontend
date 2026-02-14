import React, { useState, useEffect } from "react";
import { useAuth } from "../../Components/ServiceLayer/Context/authContext";
import { useNavigate } from "react-router-dom";
import NotificationModal from "../../Components/Modals/NotificationModal";
import LoadingOverlay from "../../Components/Modals/LoadingOverlay";
import PawfectCareLogo from "../../assets/User-Page-Image/PawfectCareLogo.svg";
import { ArrowLeft } from "lucide-react";

function AccountPage() {
  const { apiClient, user, token } = useAuth();
  const navigate = useNavigate();

  const formatDate = (dateString) => {
    if (!dateString) return "";
    return new Date(dateString).toISOString().split("T")[0];
  };

  const [formData, setFormData] = useState({
    first_name: user?.first_name || "",
    last_name: user?.last_name || "",
    birthdate: formatDate(user?.birthdate),
    monthly_salary: user?.monthly_salary || "",
  });

  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState({
    isOpen: false,
    type: "",
    message: "",
  });

  const [error, setError] = useState("");

  useEffect(() => {
    if (user) {
      setFormData({
        first_name: user.first_name || "",
        last_name: user.last_name || "",
        birthdate: formatDate(user.birthdate),
        monthly_salary: user.monthly_salary || "",
      });
    }
  }, [user]);

  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      setLoading(true);

      await apiClient.put("/process/updateProfile", formData, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setNotification({
        isOpen: true,
        type: "success",
        message: "Profile updated successfully!",
      });
    } catch (err) {
      const message =
        err.response?.data?.error || err.message || "Update failed";

      setNotification({
        isOpen: true,
        type: "error",
        message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 px-4 py-6">
      <div className="relative z-10 w-full max-w-sm sm:max-w-md md:max-w-lg lg:max-w-xl bg-white shadow-2xl rounded-3xl p-6 sm:p-8 md:p-10 mx-auto">
        <button
          onClick={() => navigate("/user/about")}
          className="absolute top-4 right-4 p-2 rounded-full hover:bg-amber-100 transition"
        >
          <ArrowLeft className="h-5 w-5 text-[#7c5e3b]" />
        </button>

        <div className="text-center mb-6">
          <div className="text-3xl font-bold text-[#a16f4a] flex items-center justify-center gap-2 mb-2">
            <img
              src={PawfectCareLogo}
              alt="Pawfect Care Logo"
              className="w-10 h-10"
            />
            Pawfect Care
          </div>

          <p className="text-sm text-gray-600 mt-2">
            Manage your account information
          </p>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-amber-900 mb-2">
                First Name
              </label>
              <input
                type="text"
                name="first_name"
                value={formData.first_name}
                onChange={handleChange}
                className="w-full px-4 py-3 border-2 border-amber-200 rounded-xl focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none transition"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-amber-900 mb-2">
                Last Name
              </label>
              <input
                type="text"
                name="last_name"
                value={formData.last_name}
                onChange={handleChange}
                className="w-full px-4 py-3 border-2 border-amber-200 rounded-xl focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none transition"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-amber-900 mb-2">
              Date of Birth
            </label>
            <input
              type="date"
              name="birthdate"
              value={formData.birthdate}
              onChange={handleChange}
              className="w-full px-4 py-3 border-2 border-amber-200 rounded-xl focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none transition"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-amber-900 mb-2">
              Monthly Income
            </label>
            <div className="relative">
              <select
                name="monthly_salary"
                value={formData.monthly_salary}
                onChange={handleChange}
                className="w-full px-4 py-3 border-2 border-amber-200 rounded-xl bg-white appearance-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none transition cursor-pointer"
                required
              >
                <option value="" disabled>
                  Select income range
                </option>
                <option value="Below₱5,000">₱0 - ₱5,000</option>
                <option value="₱5,000-₱10,000">₱5,000 - ₱10,000</option>
                <option value="₱10,001-₱20,000">₱10,001 - ₱20,000</option>
                <option value="₱20,001-₱40,000">₱20,001 - ₱40,000</option>
                <option value="₱40,001-₱60,000">₱40,001 - ₱60,000</option>
                <option value="Above₱60,000">Above ₱60,000</option>
              </select>
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-amber-600 pointer-events-none text-sm">
                ▼
              </span>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-[#a16f4a] text-white font-semibold text-lg hover:bg-amber-900 transition shadow-lg disabled:opacity-50"
          >
            {loading ? "Updating..." : "Update Account"}
          </button>
        </form>
      </div>

      <NotificationModal
        isOpen={notification.isOpen}
        onClose={() => setNotification({ ...notification, isOpen: false })}
        type={notification.type}
        message={notification.message}
      />

      <LoadingOverlay loading={loading} />
    </div>
  );
}

export default AccountPage;
