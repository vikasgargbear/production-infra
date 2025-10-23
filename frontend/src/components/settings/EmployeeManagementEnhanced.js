import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Search, X, Save, Upload, FileText, User, Filter } from 'lucide-react';
import { toast } from 'react-toastify';
import { employeesAPI, apiClient } from '../../services/api';
import { PHARMA_DESIGNATIONS, PHARMA_DEPARTMENTS, getDesignationsByCategory } from '../../constants/pharmaEmployeeOptions';

const EmployeeManagementEnhanced = () => {
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [designationFilter, setDesignationFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [formData, setFormData] = useState({
    // Basic Info
    employee_name: '',
    employee_code: '', // Auto-generated
    gender: '',
    date_of_birth: '',
    
    // Contact
    mobile: '',
    email: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    
    // Employment
    designation: '',
    department_id: null,
    branch_id: null,
    date_of_joining: new Date().toISOString().split('T')[0],
    
    // Identification
    aadhar_number: '',
    pan_number: '',
    
    // Bank Details
    bank_name: '',
    bank_account_number: '',
    bank_ifsc_code: '',
    
    // Emergency Contact
    emergency_contact_name: '',
    emergency_contact_relationship: '',
    emergency_contact_phone: '',
    
    is_active: true
  });
  
  // File uploads
  const [aadharFile, setAadharFile] = useState(null);
  const [panFile, setPanFile] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);

  useEffect(() => {
    loadEmployees();
    loadDepartments();
    loadBranches();
  }, []);

  const loadEmployees = async () => {
    setLoading(true);
    try {
      const response = await employeesAPI.getAll({ limit: 100 });
      if (response.success) {
        setEmployees(response.data || []);
      } else {
        toast.error('Failed to load employees');
      }
    } catch (error) {
      console.error('Error loading employees:', error);
      toast.error('Failed to load employees');
    } finally {
      setLoading(false);
    }
  };

  const loadDepartments = async () => {
    try {
      // Assuming departments API exists
      const response = await apiClient.get('/departments/');
      if (response.data) {
        setDepartments(response.data.data || response.data || []);
      }
    } catch (error) {
      console.error('Error loading departments:', error);
      // Set some default departments if API fails
      setDepartments([
        { department_id: 1, department_name: 'Sales' },
        { department_id: 2, department_name: 'Warehouse' },
        { department_id: 3, department_name: 'Accounts' },
        { department_id: 4, department_name: 'Management' }
      ]);
    }
  };

  const loadBranches = async () => {
    try {
      const response = await apiClient.get('/branches/');
      if (response.data) {
        setBranches(response.data.data || response.data || []);
      }
    } catch (error) {
      console.error('Error loading branches:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      employee_name: '',
      employee_code: '',
      gender: '',
      date_of_birth: '',
      mobile: '',
      email: '',
      address: '',
      city: '',
      state: '',
      pincode: '',
      designation: '',
      department_id: null,
      branch_id: null,
      date_of_joining: new Date().toISOString().split('T')[0],
      aadhar_number: '',
      pan_number: '',
      bank_name: '',
      bank_account_number: '',
      bank_ifsc_code: '',
      emergency_contact_name: '',
      emergency_contact_relationship: '',
      emergency_contact_phone: '',
      is_active: true
    });
    setAadharFile(null);
    setPanFile(null);
    setPhotoFile(null);
  };

  const handleOpenModal = (employee = null) => {
    if (employee) {
      setEditingEmployee(employee);
      
      // Parse JSONB fields
      const emergencyContact = employee.emergency_contact || {};
      const bankDetails = employee.bank_account_details || {};
      const personalDetails = employee.personal_details || {};
      
      setFormData({
        employee_name: employee.employee_name || '',
        employee_code: employee.employee_code || '',
        gender: personalDetails.gender || '',
        date_of_birth: personalDetails.date_of_birth || '',
        mobile: personalDetails.mobile || '',
        email: personalDetails.email || '',
        address: personalDetails.address || '',
        city: personalDetails.city || '',
        state: personalDetails.state || '',
        pincode: personalDetails.pincode || '',
        designation: employee.designation || '',
        department_id: employee.department_id || null,
        branch_id: employee.branch_id || null,
        date_of_joining: employee.date_of_joining || new Date().toISOString().split('T')[0],
        aadhar_number: personalDetails.aadhar_number || '',
        pan_number: personalDetails.pan_number || '',
        bank_name: bankDetails.bank_name || '',
        bank_account_number: bankDetails.account_number || '',
        bank_ifsc_code: bankDetails.ifsc_code || '',
        emergency_contact_name: emergencyContact.name || '',
        emergency_contact_relationship: emergencyContact.relationship || '',
        emergency_contact_phone: emergencyContact.phone || '',
        is_active: employee.is_active !== false
      });
    } else {
      resetForm();
      setEditingEmployee(null);
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingEmployee(null);
    resetForm();
  };

  const handleFileChange = (e, fileType) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        toast.error('File size should be less than 5MB');
        return;
      }
      
      const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
      if (!allowedTypes.includes(file.type)) {
        toast.error('Only JPEG, PNG, and PDF files are allowed');
        return;
      }
      
      switch(fileType) {
        case 'aadhar':
          setAadharFile(file);
          break;
        case 'pan':
          setPanFile(file);
          break;
        case 'photo':
          setPhotoFile(file);
          break;
        default:
          break;
      }
    }
  };

  const handleSave = async () => {
    // Validation
    if (!formData.employee_name.trim()) {
      toast.error('Employee name is required');
      return;
    }
    
    if (!formData.designation || !formData.designation.trim()) {
      toast.error('Designation is required');
      return;
    }
    
    if (!formData.mobile || formData.mobile.length !== 10) {
      toast.error('Valid 10-digit mobile number is required');
      return;
    }

    if (formData.email && !formData.email.match(/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/)) {
      toast.error('Valid email is required');
      return;
    }

    if (formData.aadhar_number && formData.aadhar_number.length !== 12) {
      toast.error('Aadhar number must be 12 digits');
      return;
    }

    if (formData.pan_number && !formData.pan_number.match(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/)) {
      toast.error('Invalid PAN number format');
      return;
    }

    setLoading(true);
    try {
      // Prepare data for backend - matching database schema
      const employeeData = {
        employee_name: formData.employee_name,
        employee_code: formData.employee_code || undefined, // Let backend auto-generate
        designation: formData.designation,
        department_id: formData.department_id,
        branch_id: formData.branch_id,
        date_of_joining: formData.date_of_joining,
        is_active: formData.is_active,
        
        // Mobile at top level (required field in database)
        mobile: formData.mobile,
        
        // Store in emergency_contact JSONB
        emergency_contact: {
          name: formData.emergency_contact_name,
          relationship: formData.emergency_contact_relationship,
          phone: formData.emergency_contact_phone
        },
        
        // Store in bank_account_details JSONB
        bank_account_details: {
          bank_name: formData.bank_name,
          account_number: formData.bank_account_number,
          ifsc_code: formData.bank_ifsc_code
        },
        
        // Personal details for backend to store properly
        personal_details: {
          gender: formData.gender,
          date_of_birth: formData.date_of_birth,
          mobile: formData.mobile,
          email: formData.email,
          address: formData.address,
          city: formData.city,
          state: formData.state,
          pincode: formData.pincode,
          aadhar_number: formData.aadhar_number,
          pan_number: formData.pan_number
        }
      };

      let response;
      if (editingEmployee) {
        response = await employeesAPI.update(editingEmployee.employee_id, employeeData);
      } else {
        response = await employeesAPI.create(employeeData);
      }

      if (response.success) {
        // Upload documents if any
        if ((aadharFile || panFile || photoFile) && response.data?.employee_id) {
          await uploadDocuments(response.data.employee_id);
        }
        
        toast.success(editingEmployee ? 'Employee updated successfully' : 'Employee created successfully');
        handleCloseModal();
        loadEmployees();
      } else {
        toast.error(response.error || 'Failed to save employee');
      }
    } catch (error) {
      console.error('Error saving employee:', error);
      toast.error('Failed to save employee');
    } finally {
      setLoading(false);
    }
  };

  const uploadDocuments = async (employeeId) => {
    const formData = new FormData();
    
    if (aadharFile) {
      formData.append('aadhar', aadharFile);
    }
    if (panFile) {
      formData.append('pan', panFile);
    }
    if (photoFile) {
      formData.append('photo', photoFile);
    }
    
    try {
      await apiClient.post(`/employees/${employeeId}/documents`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      toast.success('Documents uploaded successfully');
    } catch (error) {
      console.error('Error uploading documents:', error);
      toast.warning('Employee saved but documents upload failed');
    }
  };

  const handleDelete = async (employee) => {
    if (!window.confirm(`Are you sure you want to deactivate ${employee.employee_name}?`)) {
      return;
    }

    setLoading(true);
    try {
      const response = await employeesAPI.delete(employee.employee_id);
      if (response.success) {
        toast.success('Employee deactivated successfully');
        loadEmployees();
      } else {
        toast.error(response.error || 'Failed to deactivate employee');
      }
    } catch (error) {
      console.error('Error deleting employee:', error);
      toast.error('Failed to deactivate employee');
    } finally {
      setLoading(false);
    }
  };

  const filteredEmployees = employees.filter(employee => {
    const matchesSearch = employee.employee_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.employee_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.designation?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesDesignation = !designationFilter || 
      employee.designation?.toLowerCase().includes(designationFilter.toLowerCase());
    
    return matchesSearch && matchesDesignation;
  });

  return (
    <div className="p-6">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-gray-900">Employee Management</h2>
          <button
            onClick={() => handleOpenModal()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Employee
          </button>
        </div>

        {/* Search and Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search employees by name, code, or designation..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <select
              value={designationFilter}
              onChange={(e) => setDesignationFilter(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Designations</option>
              <option value="medical representative">Medical Representatives</option>
              <option value="sales">Sales Team</option>
              <option value="manager">Managers</option>
              <option value="pharmacist">Pharmacists</option>
              <option value="warehouse">Warehouse Staff</option>
              <option value="accounts">Accounts Team</option>
            </select>
          </div>
        </div>
      </div>

      {/* Employee List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Employee Code
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Designation
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Mobile
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Date of Joining
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading && employees.length === 0 ? (
              <tr>
                <td colSpan="7" className="px-6 py-4 text-center text-gray-500">
                  Loading employees...
                </td>
              </tr>
            ) : filteredEmployees.length === 0 ? (
              <tr>
                <td colSpan="7" className="px-6 py-4 text-center text-gray-500">
                  {searchTerm ? 'No employees found matching your search' : 'No employees found'}
                </td>
              </tr>
            ) : (
              filteredEmployees.map((employee) => (
                <tr key={employee.employee_id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {employee.employee_code || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {employee.employee_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {employee.designation || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {employee.personal_details?.mobile || employee.emergency_contact?.phone || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {employee.date_of_joining ? new Date(employee.date_of_joining).toLocaleDateString('en-IN') : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      employee.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {employee.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => handleOpenModal(employee)}
                      className="text-blue-600 hover:text-blue-900 mr-3"
                      title="Edit"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(employee)}
                      className="text-red-600 hover:text-red-900"
                      title="Deactivate"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Modal - Enhanced Form */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-blue-50">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <User className="w-5 h-5 text-blue-600" />
                {editingEmployee ? 'Edit Employee' : 'Add New Employee'}
              </h3>
              <button onClick={handleCloseModal} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Body - Scrollable */}
            <div className="px-6 py-4 overflow-y-auto flex-1">
              <div className="space-y-6">
                
                {/* Basic Information */}
                <div>
                  <h4 className="text-md font-semibold text-gray-700 mb-3 pb-2 border-b">Basic Information</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Full Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.employee_name}
                        onChange={(e) => setFormData({ ...formData, employee_name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Enter full name"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Employee Code <span className="text-gray-400">(Auto-generated)</span>
                      </label>
                      <input
                        type="text"
                        value={formData.employee_code}
                        onChange={(e) => setFormData({ ...formData, employee_code: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50"
                        placeholder="Auto-generated if left blank"
                        disabled={!!editingEmployee}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Gender
                      </label>
                      <select
                        value={formData.gender}
                        onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">Select Gender</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Date of Birth
                      </label>
                      <input
                        type="date"
                        value={formData.date_of_birth}
                        onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Contact Information */}
                <div>
                  <h4 className="text-md font-semibold text-gray-700 mb-3 pb-2 border-b">Contact Information</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Mobile Number <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="tel"
                        value={formData.mobile}
                        onChange={(e) => setFormData({ ...formData, mobile: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="10-digit mobile number"
                        maxLength="10"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Email Address
                      </label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="email@example.com"
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Address
                      </label>
                      <textarea
                        value={formData.address}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Enter complete address"
                        rows="2"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        City
                      </label>
                      <input
                        type="text"
                        value={formData.city}
                        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="City"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        State
                      </label>
                      <input
                        type="text"
                        value={formData.state}
                        onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="State"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Pincode
                      </label>
                      <input
                        type="text"
                        value={formData.pincode}
                        onChange={(e) => setFormData({ ...formData, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="6-digit pincode"
                        maxLength="6"
                      />
                    </div>
                  </div>
                </div>

                {/* Employment Details */}
                <div>
                  <h4 className="text-md font-semibold text-gray-700 mb-3 pb-2 border-b">Employment Details</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Designation <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={formData.designation}
                        onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">Select Designation</option>
                        {Object.entries(getDesignationsByCategory()).map(([category, designations]) => (
                          <optgroup key={category} label={category}>
                            {designations.map((des) => (
                              <option key={des.value} value={des.value}>
                                {des.label}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Department
                      </label>
                      <select
                        value={formData.department_id || ''}
                        onChange={(e) => setFormData({ ...formData, department_id: e.target.value ? parseInt(e.target.value) : null })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">Select Department</option>
                        {departments.map((dept) => (
                          <option key={dept.department_id} value={dept.department_id}>
                            {dept.department_name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Branch
                      </label>
                      <select
                        value={formData.branch_id || ''}
                        onChange={(e) => setFormData({ ...formData, branch_id: e.target.value ? parseInt(e.target.value) : null })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">Select Branch</option>
                        {branches.map((branch) => (
                          <option key={branch.branch_id} value={branch.branch_id}>
                            {branch.branch_name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Date of Joining
                      </label>
                      <input
                        type="date"
                        value={formData.date_of_joining}
                        onChange={(e) => setFormData({ ...formData, date_of_joining: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Identification */}
                <div>
                  <h4 className="text-md font-semibold text-gray-700 mb-3 pb-2 border-b">Identification Documents</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Aadhar Number
                      </label>
                      <input
                        type="text"
                        value={formData.aadhar_number}
                        onChange={(e) => setFormData({ ...formData, aadhar_number: e.target.value.replace(/\D/g, '').slice(0, 12) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="12-digit Aadhar number"
                        maxLength="12"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Aadhar Document
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="file"
                          onChange={(e) => handleFileChange(e, 'aadhar')}
                          accept="image/*,.pdf"
                          className="hidden"
                          id="aadhar-upload"
                        />
                        <label
                          htmlFor="aadhar-upload"
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 flex items-center justify-center gap-2"
                        >
                          <Upload className="w-4 h-4" />
                          {aadharFile ? aadharFile.name : 'Upload Aadhar'}
                        </label>
                        {aadharFile && (
                          <button
                            onClick={() => setAadharFile(null)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        PAN Number
                      </label>
                      <input
                        type="text"
                        value={formData.pan_number}
                        onChange={(e) => setFormData({ ...formData, pan_number: e.target.value.toUpperCase().slice(0, 10) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="ABCDE1234F"
                        maxLength="10"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        PAN Document
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="file"
                          onChange={(e) => handleFileChange(e, 'pan')}
                          accept="image/*,.pdf"
                          className="hidden"
                          id="pan-upload"
                        />
                        <label
                          htmlFor="pan-upload"
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 flex items-center justify-center gap-2"
                        >
                          <Upload className="w-4 h-4" />
                          {panFile ? panFile.name : 'Upload PAN'}
                        </label>
                        {panFile && (
                          <button
                            onClick={() => setPanFile(null)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Employee Photo
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="file"
                          onChange={(e) => handleFileChange(e, 'photo')}
                          accept="image/*"
                          className="hidden"
                          id="photo-upload"
                        />
                        <label
                          htmlFor="photo-upload"
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 flex items-center justify-center gap-2"
                        >
                          <Upload className="w-4 h-4" />
                          {photoFile ? photoFile.name : 'Upload Photo'}
                        </label>
                        {photoFile && (
                          <button
                            onClick={() => setPhotoFile(null)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bank Details */}
                <div>
                  <h4 className="text-md font-semibold text-gray-700 mb-3 pb-2 border-b">Bank Details</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Bank Name
                      </label>
                      <input
                        type="text"
                        value={formData.bank_name}
                        onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="e.g., HDFC Bank"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Account Number
                      </label>
                      <input
                        type="text"
                        value={formData.bank_account_number}
                        onChange={(e) => setFormData({ ...formData, bank_account_number: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Bank account number"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        IFSC Code
                      </label>
                      <input
                        type="text"
                        value={formData.bank_ifsc_code}
                        onChange={(e) => setFormData({ ...formData, bank_ifsc_code: e.target.value.toUpperCase() })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="IFSC Code"
                        maxLength="11"
                      />
                    </div>
                  </div>
                </div>

                {/* Emergency Contact */}
                <div>
                  <h4 className="text-md font-semibold text-gray-700 mb-3 pb-2 border-b">Emergency Contact</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Contact Name
                      </label>
                      <input
                        type="text"
                        value={formData.emergency_contact_name}
                        onChange={(e) => setFormData({ ...formData, emergency_contact_name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Emergency contact name"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Relationship
                      </label>
                      <input
                        type="text"
                        value={formData.emergency_contact_relationship}
                        onChange={(e) => setFormData({ ...formData, emergency_contact_relationship: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="e.g., Father, Mother, Spouse"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Phone Number
                      </label>
                      <input
                        type="tel"
                        value={formData.emergency_contact_phone}
                        onChange={(e) => setFormData({ ...formData, emergency_contact_phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="10-digit mobile"
                        maxLength="10"
                      />
                    </div>
                  </div>
                </div>

                {/* Status */}
                <div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="is_active"
                      checked={formData.is_active}
                      onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <label htmlFor="is_active" className="ml-2 block text-sm text-gray-700">
                      Active Employee
                    </label>
                  </div>
                </div>

              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
              <button
                onClick={handleCloseModal}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:bg-gray-400"
              >
                <Save className="w-4 h-4" />
                {loading ? 'Saving...' : 'Save Employee'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeeManagementEnhanced;
