import { useState, useEffect } from 'react';
import { Plus, Search, FileText, Package, Truck, CheckCircle2, ChevronRight, ChevronLeft, ShoppingCart, Clock, LogOut, User as UserIcon, Trash2, Edit, Receipt, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { auth, db } from './firebase';
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from 'firebase/auth';
import { collection, doc, setDoc, getDoc, onSnapshot, query, where, updateDoc, deleteDoc } from 'firebase/firestore';

import { terbilang } from './lib/terbilang';

// --- Types ---
type OrderStatus = 'PO_RECEIVED' | 'ORDERING' | 'DELIVERING' | 'AT_KITCHEN' | 'COMPLETED' | 'INVOICED';

interface OrderItem {
  id: string;
  name: string;
  quantity: number | string;
  unit: string;
  supplier: string;
  unitPrice?: number;
  isOrdered: boolean;
  isAtKitchen: boolean;
  isDelivered: boolean;
  isReceived: boolean;
}

interface PurchaseOrder {
  id: string;
  clientId: string;
  clientName: string;
  date: string;
  status: OrderStatus;
  items: OrderItem[];
  notes: string;
}

interface Supplier {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  district?: string;
}

interface UserProfile {
  uid: string;
  email: string;
  name: string;
  role: 'admin' | 'driver' | 'client' | 'kitchen';
  phone?: string;
  address?: string;
  district?: string;
}

const statusConfig = {
  PO_RECEIVED: { label: 'PO Diterima', color: 'bg-blue-100 text-blue-800', icon: FileText },
  ORDERING: { label: 'Proses Order', color: 'bg-amber-100 text-amber-800', icon: ShoppingCart },
  DELIVERING: { label: 'Proses Kirim', color: 'bg-indigo-100 text-indigo-800', icon: Truck },
  AT_KITCHEN: { label: 'Sampai Dapur', color: 'bg-orange-100 text-orange-800', icon: Package },
  COMPLETED: { label: 'Selesai (Diterima Klien)', color: 'bg-emerald-100 text-emerald-800', icon: CheckCircle2 },
  INVOICED: { label: 'Nota Dibuat', color: 'bg-purple-100 text-purple-800', icon: Receipt },
};

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [clients, setClients] = useState<UserProfile[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [isUserManageOpen, setIsUserManageOpen] = useState(false);
  const [isSupplierManageOpen, setIsSupplierManageOpen] = useState(false);
  const [isNewClientOpen, setIsNewClientOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);
  const [poToDelete, setPoToDelete] = useState<string | null>(null);
  const [supplierToDelete, setSupplierToDelete] = useState<string | null>(null);

  // Edit User State
  const [isEditUserOpen, setIsEditUserOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [editUserName, setEditUserName] = useState('');
  const [editUserPhone, setEditUserPhone] = useState('');
  const [editUserAddress, setEditUserAddress] = useState('');
  const [editUserDistrict, setEditUserDistrict] = useState('');
  const [editUserError, setEditUserError] = useState<string | null>(null);

  // Supplier State
  const [isEditSupplierOpen, setIsEditSupplierOpen] = useState(false);
  const [isNewSupplierOpen, setIsNewSupplierOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [supplierName, setSupplierName] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [supplierAddress, setSupplierAddress] = useState('');
  const [supplierDistrict, setSupplierDistrict] = useState('');
  const [supplierError, setSupplierError] = useState<string | null>(null);

  // New PO Form State
  const [newClientId, setNewClientId] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newItems, setNewItems] = useState<Omit<OrderItem, 'id' | 'isOrdered' | 'isAtKitchen' | 'isDelivered' | 'isReceived'>[]>([
    { name: '', quantity: 1, unit: 'pcs', supplier: '', unitPrice: 0 }
  ]);

  // Edit PO Form State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingPO, setEditingPO] = useState<PurchaseOrder | null>(null);
  const [editClientId, setEditClientId] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editItems, setEditItems] = useState<OrderItem[]>([]);
  const [editError, setEditError] = useState<string | null>(null);

  // Invoice State
  const [invoiceOrder, setInvoiceOrder] = useState<PurchaseOrder | null>(null);

  // New Client Form State
  const [newClientName, setNewClientName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [newClientAddress, setNewClientAddress] = useState('');
  const [clientError, setClientError] = useState<string | null>(null);
  const [newPoError, setNewPoError] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [globalSuccess, setGlobalSuccess] = useState<string | null>(null);

  // Handle Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          const userRef = doc(db, 'users', firebaseUser.uid);
          const userSnap = await getDoc(userRef);
          
          let profile: UserProfile;
          if (userSnap.exists()) {
            profile = userSnap.data() as UserProfile;
            if (profile.email === 'obym.ppngroup@gmail.com' && profile.role !== 'admin') {
              profile.role = 'admin';
              await updateDoc(userRef, { role: 'admin' });
            }
          } else {
            // Default to client if not exists
            profile = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || 'no-email@example.com',
              name: firebaseUser.displayName || 'User',
              role: firebaseUser.email === 'obym.ppngroup@gmail.com' ? 'admin' : 'client'
            };
            await setDoc(userRef, profile);
          }
          setUser(profile);
        } else {
          setUser(null);
        }
      } catch (error: any) {
        console.error("Error in auth state change:", error);
        alert("Gagal memuat profil: " + (error.message || "Terjadi kesalahan"));
        setUser(null);
      } finally {
        setIsAuthReady(true);
      }
    });
    return () => unsubscribe();
  }, []);

  // Handle Data Fetching
  useEffect(() => {
    if (!isAuthReady || !user) return;

    let q = collection(db, 'purchaseOrders');
    if (user.role === 'client') {
      q = query(collection(db, 'purchaseOrders'), where('clientId', '==', user.uid)) as any;
    }

    const unsubscribeOrders = onSnapshot(q, (snapshot) => {
      const fetchedOrders = snapshot.docs.map(doc => doc.data() as PurchaseOrder);
      setOrders(fetchedOrders);
    }, (error) => {
      console.error("Error fetching orders:", error);
    });

    let unsubscribeClients = () => {};
    let unsubscribeAllUsers = () => {};
    let unsubscribeSuppliers = () => {};
    if (user.role === 'admin') {
      const clientsQuery = query(collection(db, 'users'), where('role', '==', 'client'));
      unsubscribeClients = onSnapshot(clientsQuery, (snapshot) => {
        setClients(snapshot.docs.map(doc => doc.data() as UserProfile));
      });

      const allUsersQuery = query(collection(db, 'users'));
      unsubscribeAllUsers = onSnapshot(allUsersQuery, (snapshot) => {
        setAllUsers(snapshot.docs.map(doc => doc.data() as UserProfile));
      });

      const suppliersQuery = query(collection(db, 'suppliers'));
      unsubscribeSuppliers = onSnapshot(suppliersQuery, (snapshot) => {
        setSuppliers(snapshot.docs.map(doc => doc.data() as Supplier));
      });
    }

    return () => {
      unsubscribeOrders();
      unsubscribeClients();
      unsubscribeAllUsers();
      unsubscribeSuppliers();
    };
  }, [isAuthReady, user]);

  // Sync selectedOrder when orders change
  useEffect(() => {
    if (selectedOrder) {
      const updated = orders.find(o => o.id === selectedOrder.id);
      if (updated && JSON.stringify(updated) !== JSON.stringify(selectedOrder)) {
        setSelectedOrder(updated);
      }
    }
  }, [orders, selectedOrder]);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error("Login failed", error);
      alert("Login gagal: " + (error.message || "Terjadi kesalahan"));
    }
  };

  const handleLogout = () => {
    signOut(auth);
  };

  const handleAddItem = () => {
    setNewItems([...newItems, { name: '', quantity: 1, unit: 'pcs', supplier: '', unitPrice: 0 }]);
  };

  const handleRemoveItem = (index: number) => {
    setNewItems(newItems.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof typeof newItems[0], value: string | number) => {
    const updated = [...newItems];
    updated[index] = { ...updated[index], [field]: value };
    setNewItems(updated);
  };

  const handleUpdateUserRole = async (userId: string, newRole: string) => {
    try {
      await updateDoc(doc(db, 'users', userId), { role: newRole });
    } catch (error) {
      console.error("Error updating user role:", error);
      alert("Gagal mengupdate role. Periksa koneksi atau hak akses Anda.");
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    try {
      await deleteDoc(doc(db, 'users', userToDelete));
      setUserToDelete(null);
    } catch (error) {
      console.error("Error deleting user:", error);
      alert("Gagal menghapus pengguna. Pastikan Anda memiliki akses Admin.");
    }
  };

  const openEditUser = (user: UserProfile) => {
    setEditingUser(user);
    setEditUserName(user.name);
    setEditUserPhone(user.phone || '');
    setEditUserAddress(user.address || '');
    setEditUserDistrict(user.district || '');
    setEditUserError(null);
    setIsEditUserOpen(true);
  };

  const handleUpdateUser = async () => {
    setEditUserError(null);
    if (!editingUser || !editUserName) {
      setEditUserError('Mohon lengkapi nama pengguna.');
      return;
    }

    try {
      await updateDoc(doc(db, 'users', editingUser.uid), {
        name: editUserName,
        phone: editUserPhone,
        address: editUserAddress,
        district: editUserDistrict
      });
      setIsEditUserOpen(false);
      setEditingUser(null);
    } catch (error) {
      console.error("Error updating user:", error);
      setEditUserError("Gagal memperbarui pengguna. Pastikan Anda memiliki akses Admin.");
    }
  };

  const handleCreateSupplier = async () => {
    setSupplierError(null);
    if (!supplierName) {
      setSupplierError('Mohon lengkapi nama supplier.');
      return;
    }

    try {
      const newId = `supplier-${Date.now()}`;
      const newSupplier: Supplier = {
        id: newId,
        name: supplierName,
        phone: supplierPhone,
        address: supplierAddress,
        district: supplierDistrict
      };
      
      await setDoc(doc(db, 'suppliers', newId), newSupplier);
      setIsNewSupplierOpen(false);
      setSupplierName('');
      setSupplierPhone('');
      setSupplierAddress('');
      setSupplierDistrict('');
    } catch (error) {
      console.error("Error creating supplier:", error);
      setSupplierError("Gagal membuat supplier. Pastikan Anda memiliki akses Admin.");
    }
  };

  const openEditSupplier = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setSupplierName(supplier.name);
    setSupplierPhone(supplier.phone || '');
    setSupplierAddress(supplier.address || '');
    setSupplierDistrict(supplier.district || '');
    setSupplierError(null);
    setIsEditSupplierOpen(true);
  };

  const handleUpdateSupplier = async () => {
    setSupplierError(null);
    if (!editingSupplier || !supplierName) {
      setSupplierError('Mohon lengkapi nama supplier.');
      return;
    }

    try {
      await updateDoc(doc(db, 'suppliers', editingSupplier.id), {
        name: supplierName,
        phone: supplierPhone,
        address: supplierAddress,
        district: supplierDistrict
      });
      setIsEditSupplierOpen(false);
      setEditingSupplier(null);
    } catch (error) {
      console.error("Error updating supplier:", error);
      setSupplierError("Gagal memperbarui supplier. Pastikan Anda memiliki akses Admin.");
    }
  };

  const handleDeleteSupplier = async () => {
    if (!supplierToDelete) return;
    try {
      await deleteDoc(doc(db, 'suppliers', supplierToDelete));
      setSupplierToDelete(null);
    } catch (error) {
      console.error("Error deleting supplier:", error);
      alert("Gagal menghapus supplier. Pastikan Anda memiliki akses Admin.");
    }
  };

  const handleCreateClient = async () => {
    setClientError(null);
    if (!newClientName) {
      setClientError('Mohon lengkapi nama klien.');
      return;
    }

    try {
      // Generate a simple unique ID for manually created clients
      const newUid = `client-${Date.now()}`;
      const newClient: UserProfile = {
        uid: newUid,
        name: newClientName,
        email: `${newUid}@no-email.com`, // Dummy email since it's required by the schema
        role: 'client',
        phone: newClientPhone,
        address: newClientAddress
      };

      await setDoc(doc(db, 'users', newUid), newClient);
      setIsNewClientOpen(false);
      setNewClientName('');
      setNewClientPhone('');
      setNewClientAddress('');
    } catch (error) {
      console.error("Error creating client:", error);
      setClientError("Gagal menambahkan klien. Pastikan Anda memiliki akses Admin.");
    }
  };

  const handleCreatePO = async () => {
    setNewPoError(null);
    if (!newClientId || newItems.length === 0 || newItems.some(i => !i.name || !i.supplier)) {
      setNewPoError('Mohon lengkapi semua field yang wajib (termasuk Nama Barang dan Supplier).');
      return;
    }

    const client = clients.find(c => c.uid === newClientId);
    if (!client) return;

    const newPO: PurchaseOrder = {
      id: `PO-${new Date().getFullYear()}-${String(orders.length + 1).padStart(3, '0')}`,
      clientId: client.uid,
      clientName: client.name,
      date: new Date().toISOString(),
      status: 'PO_RECEIVED',
      notes: newNotes,
      items: newItems.map((item, i) => ({
        ...item,
        quantity: typeof item.quantity === 'string' ? parseFloat(item.quantity) || 0 : item.quantity,
        id: `i-${Date.now()}-${i}`,
        isOrdered: false,
        isAtKitchen: false,
        isDelivered: false,
        isReceived: false,
      })),
    };

    try {
      await setDoc(doc(db, 'purchaseOrders', newPO.id), newPO);
      setIsNewOpen(false);
      setNewClientId('');
      setNewNotes('');
      setNewItems([{ name: '', quantity: 1, unit: 'pcs', supplier: '', unitPrice: 0 }]);
    } catch (error) {
      console.error("Error creating PO:", error);
      setNewPoError("Gagal membuat PO. Pastikan Anda memiliki akses Admin.");
    }
  };

  const openEditPO = (po: PurchaseOrder) => {
    if (user?.role !== 'admin') return;
    setEditingPO(po);
    setEditClientId(po.clientId);
    setEditNotes(po.notes);
    setEditItems(po.items);
    setEditError(null);
    setIsEditOpen(true);
  };

  const handleEditItemChange = (index: number, field: keyof OrderItem, value: any) => {
    const updated = [...editItems];
    updated[index] = { ...updated[index], [field]: value };
    setEditItems(updated);
  };

  const handleAddEditItem = () => {
    setEditItems([...editItems, { 
      id: `i-${Date.now()}-${editItems.length}`, 
      name: '', quantity: 1, unit: 'pcs', supplier: '', unitPrice: 0,
      isOrdered: false, isAtKitchen: false, isDelivered: false, isReceived: false 
    }]);
  };

  const handleRemoveEditItem = (index: number) => {
    setEditItems(editItems.filter((_, i) => i !== index));
  };

  const handleUpdatePO = async () => {
    setEditError(null);
    if (!editingPO || !editClientId || editItems.length === 0 || editItems.some(i => !i.name || !i.supplier)) {
      setEditError('Mohon lengkapi semua field yang wajib (termasuk Nama Barang dan Supplier).');
      return;
    }

    const client = clients.find(c => c.uid === editClientId);
    if (!client) {
      setEditError('Klien tidak ditemukan.');
      return;
    }

    try {
      await updateDoc(doc(db, 'purchaseOrders', editingPO.id), {
        clientId: client.uid,
        clientName: client.name,
        notes: editNotes,
        items: editItems.map(item => ({
          ...item,
          quantity: typeof item.quantity === 'string' ? parseFloat(item.quantity) || 0 : item.quantity
        }))
      });
      setIsEditOpen(false);
      setEditingPO(null);
    } catch (error) {
      console.error("Error updating PO:", error);
      setEditError("Gagal memperbarui PO. Pastikan Anda memiliki akses.");
    }
  };

  const handleOpenInvoice = async (order: PurchaseOrder) => {
    setInvoiceOrder(order);
    setIsDetailOpen(false); // Close detail modal
    
    // If status is COMPLETED, update it to INVOICED
    if (order.status === 'COMPLETED' && user?.role === 'admin') {
      try {
        await updateDoc(doc(db, 'purchaseOrders', order.id), {
          status: 'INVOICED'
        });
      } catch (error) {
        console.error("Error updating status to INVOICED:", error);
      }
    }
  };

  const handlePrintInvoice = () => {
    window.print();
  };

  const handleDeletePO = async () => {
    if (user?.role !== 'admin' || !poToDelete) {
      setGlobalError("Hanya Admin yang dapat menghapus PO.");
      return;
    }
    
    try {
      await deleteDoc(doc(db, 'purchaseOrders', poToDelete));
      setPoToDelete(null);
      setSelectedOrder(null);
      setGlobalSuccess("PO sudah dihapus.");
      
      // Auto-hide success message after 3 seconds
      setTimeout(() => {
        setGlobalSuccess(null);
      }, 3000);
    } catch (error) {
      console.error("Error deleting PO:", error);
      setGlobalError("Gagal menghapus PO. Pastikan Anda memiliki akses Admin.");
    }
  };

  const toggleItemStatus = async (orderId: string, itemId: string, field: keyof OrderItem) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    const updatedItems = order.items.map(item => {
      if (item.id !== itemId) return item;
      
      const newItem = { ...item, [field]: !item[field] };
      
      // Logic dependencies
      if (field === 'isReceived' && newItem.isReceived) {
        newItem.isAtKitchen = true;
        newItem.isDelivered = true;
        newItem.isOrdered = true;
      }
      if (field === 'isAtKitchen' && newItem.isAtKitchen) {
        newItem.isDelivered = true;
        newItem.isOrdered = true;
      }
      if (field === 'isDelivered' && newItem.isDelivered) {
        newItem.isOrdered = true;
      }
      
      return newItem;
    });

    // Determine new status
    const allReceived = updatedItems.every(i => i.isReceived);
    const allAtKitchen = updatedItems.every(i => i.isAtKitchen);
    const allDelivered = updatedItems.every(i => i.isDelivered);
    const allOrdered = updatedItems.every(i => i.isOrdered);
    const someOrdered = updatedItems.some(i => i.isOrdered);

    let newStatus = order.status;
    if (allReceived) newStatus = 'COMPLETED';
    else if (allAtKitchen) newStatus = 'AT_KITCHEN';
    else if (allDelivered) newStatus = 'DELIVERING'; 
    else if (allOrdered) newStatus = 'DELIVERING';
    else if (someOrdered) newStatus = 'ORDERING';
    else newStatus = 'PO_RECEIVED';

    try {
      await updateDoc(doc(db, 'purchaseOrders', orderId), {
        items: updatedItems,
        status: newStatus
      });
    } catch (error) {
      console.error("Error updating item:", error);
      alert("Gagal mengupdate status. Periksa koneksi atau hak akses Anda.");
    }
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          <p className="text-slate-600 font-medium">Memuat aplikasi...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <Card className="w-[400px] shadow-lg">
          <CardHeader className="text-center">
            <div className="mx-auto flex items-center justify-center mb-4">
              <img 
                src="https://upload.wikimedia.org/wikipedia/commons/9/90/National_emblem_of_Indonesia_Garuda_Pancasila.svg" 
                alt="Garuda Pancasila" 
                className="w-20 h-20 object-contain"
                referrerPolicy="no-referrer"
              />
            </div>
            <CardTitle className="text-2xl">PO & Pengiriman Tracker</CardTitle>
            <CardDescription>Masuk untuk mengelola pesanan dan pengiriman</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center pb-8">
            <Button onClick={handleLogin} className="w-full bg-indigo-600 hover:bg-indigo-700">
              Login dengan Google
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (invoiceOrder) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col">
        {/* Print controls (hidden in print) */}
        <div className="print:hidden p-4 border-b border-slate-200 flex justify-between items-center bg-white shadow-sm sticky top-0 z-10">
           <Button variant="outline" onClick={() => setInvoiceOrder(null)}>
             <ChevronLeft className="w-4 h-4 mr-2" /> Kembali
           </Button>
           <Button onClick={handlePrintInvoice} className="bg-indigo-600 hover:bg-indigo-700">
             <Printer className="w-4 h-4 mr-2" /> Cetak Nota
           </Button>
        </div>
        
        {/* Invoice content */}
        <div className="flex-1 p-4 sm:p-8 overflow-auto flex justify-center">
          <div id="print-area" className="bg-white text-black p-8 sm:p-12 font-sans text-sm w-full max-w-4xl shadow-lg border border-slate-200">
            {/* Header */}
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold border-2 border-black inline-block px-16 py-1 mb-2 tracking-widest">NOTA</h1>
              <h2 className="text-xl font-bold uppercase">KOPERASI GARUDA MERAH PUTIH</h2>
              <p>Dsn. Padangan RT 02 RW 03 Ds. Pagu</p>
              <p>Kec. Pagu Kab. Kediri</p>
              <p>Phone : 0812-5278-8733</p>
            </div>

            {/* Info */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <table className="w-full">
                  <tbody>
                    <tr>
                      <td className="w-24">Nomor</td>
                      <td className="w-4">:</td>
                      <td>{invoiceOrder.id}</td>
                    </tr>
                    <tr>
                      <td>Tanggal Nota</td>
                      <td>:</td>
                      <td>{new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div>
                <p className="font-bold">Kepada :</p>
                <p className="font-bold">{invoiceOrder.clientName}</p>
                {clients.find(c => c.uid === invoiceOrder.clientId)?.address && (
                  <p>{clients.find(c => c.uid === invoiceOrder.clientId)?.address}</p>
                )}
                {clients.find(c => c.uid === invoiceOrder.clientId)?.district && (
                  <p>{clients.find(c => c.uid === invoiceOrder.clientId)?.district}</p>
                )}
              </div>
            </div>

            {/* Table */}
            <table className="w-full border-collapse border border-black mb-4">
              <thead>
                <tr className="bg-gray-200">
                  <th className="border border-black p-2 text-center w-10">NO</th>
                  <th className="border border-black p-2 text-left">NAMA BARANG</th>
                  <th className="border border-black p-2 text-center w-16">QTY</th>
                  <th className="border border-black p-2 text-center w-24">SATUAN</th>
                  <th className="border border-black p-2 text-right w-32">HARGA</th>
                  <th className="border border-black p-2 text-right w-32">SUBTOTAL</th>
                </tr>
              </thead>
              <tbody>
                {invoiceOrder.items.map((item, index) => {
                  const qty = typeof item.quantity === 'string' ? parseFloat(item.quantity) : item.quantity;
                  const price = item.unitPrice || 0;
                  const subtotal = qty * price;
                  return (
                    <tr key={item.id}>
                      <td className="border border-black p-2 text-center">{index + 1}</td>
                      <td className="border border-black p-2">{item.name}</td>
                      <td className="border border-black p-2 text-center">{qty}</td>
                      <td className="border border-black p-2 text-center">{item.unit}</td>
                      <td className="border border-black p-2 text-right">
                        {price > 0 ? price.toLocaleString('id-ID') : '-'}
                      </td>
                      <td className="border border-black p-2 text-right">
                        {subtotal > 0 ? subtotal.toLocaleString('id-ID') : '-'}
                      </td>
                    </tr>
                  );
                })}
                <tr>
                  <td colSpan={4} className="border-t border-black"></td>
                  <td className="border border-black p-2 text-right font-bold">TOTAL</td>
                  <td className="border border-black p-2 text-right font-bold">
                    {invoiceOrder.items.reduce((sum, item) => {
                      const qty = typeof item.quantity === 'string' ? parseFloat(item.quantity) : item.quantity;
                      const price = item.unitPrice || 0;
                      return sum + (qty * price);
                    }, 0).toLocaleString('id-ID')}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Terbilang */}
            <div className="mb-6">
              <p className="font-bold mb-1">Terbilang :</p>
              <div className="border border-black p-2 inline-block min-w-[50%] italic">
                {terbilang(invoiceOrder.items.reduce((sum, item) => {
                  const qty = typeof item.quantity === 'string' ? parseFloat(item.quantity) : item.quantity;
                  const price = item.unitPrice || 0;
                  return sum + (qty * price);
                }, 0))} Rupiah
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-between">
              <div>
                <p>BANK TRANSFER :</p>
                <p>Rekening Koperasi Garuda Merah Putih</p>
                <p>Bank Mandiri : 171-00-1986218-7</p>
              </div>
              <div className="text-center mr-12">
                <p>Hormat Kami,</p>
                <div className="h-24"></div>
                <p className="font-bold">Hariaji</p>
                <p>Ketua Koperasi</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const filteredOrders = orders.filter(o => 
    o.clientName.toLowerCase().includes(searchQuery.toLowerCase()) || 
    o.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderKanbanColumn = (status: OrderStatus) => {
    let columnOrders = filteredOrders.filter(o => o.status === status);
    
    // Jika bukan admin, gabungkan INVOICED ke dalam COMPLETED
    if (status === 'COMPLETED' && user.role !== 'admin') {
      columnOrders = filteredOrders.filter(o => o.status === 'COMPLETED' || o.status === 'INVOICED');
    }

    const config = statusConfig[status];
    const Icon = config.icon;

    // Filter for driver: only show ORDERING, DELIVERING, and AT_KITCHEN
    if (user.role === 'driver' && status !== 'ORDERING' && status !== 'DELIVERING' && status !== 'AT_KITCHEN') {
      return null;
    }

    return (
      <div key={status} className="flex flex-col bg-slate-50 rounded-xl p-4 min-w-[300px] max-w-[350px] border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Icon className="w-5 h-5 text-slate-600" />
            <h3 className="font-semibold text-slate-800">{config.label}</h3>
          </div>
          <Badge variant="secondary" className="bg-slate-200 text-slate-700">{columnOrders.length}</Badge>
        </div>
        
        <div className="flex flex-col gap-3 overflow-y-auto pr-1" style={{ maxHeight: 'calc(100vh - 240px)' }}>
          {columnOrders.map(order => (
            <Card 
              key={order.id} 
              className="cursor-pointer hover:border-slate-400 transition-colors shadow-sm"
              onClick={() => {
                setSelectedOrder(order);
                setIsDetailOpen(true);
              }}
            >
              <CardHeader className="p-4 pb-2">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-sm font-bold text-slate-800">{order.id}</CardTitle>
                  <Badge className={config.color} variant="outline">{config.label}</Badge>
                </div>
                <CardDescription className="text-xs mt-1 text-slate-500">
                  {new Date(order.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <p className="font-medium text-slate-700 mb-2">{order.clientName}</p>
                
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <div className="flex items-center gap-1">
                    <Package className="w-3.5 h-3.5" />
                    <span>{order.items.length} items</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span>{order.items.filter(i => i.isReceived).length} diterima</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {columnOrders.length === 0 && (
            <div className="text-center p-6 border-2 border-dashed border-slate-200 rounded-lg text-slate-400 text-sm">
              Tidak ada PO
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-900 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col xl:flex-row items-center justify-between gap-4">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <div className="flex items-center justify-center">
              <img 
                src="https://upload.wikimedia.org/wikipedia/commons/9/90/National_emblem_of_Indonesia_Garuda_Pancasila.svg" 
                alt="Garuda Pancasila" 
                className="w-10 h-10 object-contain"
                referrerPolicy="no-referrer"
              />
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-800 tracking-tight text-center">PO & Pengiriman Tracker</h1>
            <Badge variant="outline" className="uppercase bg-slate-100">{user.role}</Badge>
          </div>
          
          <div className="flex flex-wrap items-center justify-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input 
                placeholder="Cari PO atau Klien..." 
                className="pl-9 w-[200px] sm:w-[250px] bg-slate-50 border-slate-200"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            
            {user.role === 'admin' && (
              <>
              <Dialog open={isNewOpen} onOpenChange={setIsNewOpen}>
                <DialogTrigger render={<Button className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm" />}>
                  <Plus className="w-4 h-4 mr-2 hidden sm:block" />
                  PO Baru
                </DialogTrigger>
                <DialogContent className="max-w-4xl sm:max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Buat Purchase Order Baru</DialogTitle>
                    <DialogDescription>
                      Masukkan detail PO dari klien untuk mulai dilacak.
                    </DialogDescription>
                  </DialogHeader>
                  
                  {newPoError && (
                    <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm mb-4">
                      {newPoError}
                    </div>
                  )}

                  <div className="grid gap-6 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="clientSelect">Pilih Klien <span className="text-red-500">*</span></Label>
                        <select 
                          id="clientSelect"
                          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                          value={newClientId}
                          onChange={(e) => setNewClientId(e.target.value)}
                        >
                          <option value="" disabled>-- Pilih Klien --</option>
                          {clients.map(c => (
                            <option key={c.uid} value={c.uid}>{c.name} ({c.email})</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="notes">Catatan Tambahan</Label>
                        <Input 
                          id="notes" 
                          placeholder="Contoh: Kirim pagi hari" 
                          value={newNotes}
                          onChange={(e) => setNewNotes(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label className="text-base">Daftar Barang <span className="text-red-500">*</span></Label>
                        <Button type="button" variant="outline" size="sm" onClick={handleAddItem}>
                          <Plus className="w-4 h-4 mr-2" /> Tambah Barang
                        </Button>
                      </div>
                      
                      <div className="border rounded-md overflow-x-auto">
                        <Table className="min-w-[800px]">
                          <TableHeader className="bg-slate-50">
                            <TableRow>
                              <TableHead>Nama Barang</TableHead>
                              <TableHead className="w-[100px]">Qty</TableHead>
                              <TableHead className="w-[120px]">Satuan</TableHead>
                              <TableHead className="w-[150px]">Harga Satuan</TableHead>
                              <TableHead>Supplier</TableHead>
                              <TableHead className="w-[50px]"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {newItems.map((item, index) => (
                              <TableRow key={index}>
                                <TableCell className="p-2">
                                  <Input 
                                    placeholder="Nama barang" 
                                    value={item.name}
                                    onChange={(e) => handleItemChange(index, 'name', e.target.value)}
                                  />
                                </TableCell>
                                <TableCell className="p-2">
                                  <Input 
                                    type="text" 
                                    value={item.quantity}
                                    onChange={(e) => {
                                      const val = e.target.value.replace(/,/g, '.');
                                      if (/^\d*\.?\d*$/.test(val)) {
                                        handleItemChange(index, 'quantity', val);
                                      }
                                    }}
                                  />
                                </TableCell>
                                <TableCell className="p-2">
                                  <Input 
                                    placeholder="kg, pcs..." 
                                    value={item.unit}
                                    onChange={(e) => handleItemChange(index, 'unit', e.target.value)}
                                  />
                                </TableCell>
                                <TableCell className="p-2">
                                  <Input 
                                    type="text" 
                                    placeholder="0"
                                    value={item.unitPrice ? new Intl.NumberFormat('id-ID').format(Number(item.unitPrice)) : ''}
                                    onChange={(e) => {
                                      const val = e.target.value.replace(/\./g, '');
                                      if (/^\d*$/.test(val)) {
                                        handleItemChange(index, 'unitPrice', val === '' ? 0 : parseInt(val));
                                      }
                                    }}
                                  />
                                </TableCell>
                                <TableCell className="p-2">
                                  {suppliers.length > 0 ? (
                                    <select
                                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                      value={item.supplier}
                                      onChange={(e) => handleItemChange(index, 'supplier', e.target.value)}
                                    >
                                      <option value="" disabled>Pilih Supplier</option>
                                      {suppliers.map(s => (
                                        <option key={s.id} value={s.name}>{s.name}</option>
                                      ))}
                                    </select>
                                  ) : (
                                    <Input 
                                      placeholder="Nama supplier" 
                                      value={item.supplier}
                                      onChange={(e) => handleItemChange(index, 'supplier', e.target.value)}
                                    />
                                  )}
                                </TableCell>
                                <TableCell className="p-2 text-center">
                                  <Button 
                                    type="button" 
                                    variant="ghost" 
                                    size="icon" 
                                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                    onClick={() => handleRemoveItem(index)}
                                    disabled={newItems.length === 1}
                                  >
                                    &times;
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </div>
                  
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsNewOpen(false)}>Batal</Button>
                    <Button onClick={handleCreatePO} className="bg-indigo-600 hover:bg-indigo-700">Simpan PO</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              </>
            )}

            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
              <DialogContent className="max-w-4xl sm:max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Edit Purchase Order</DialogTitle>
                    <DialogDescription>
                      Ubah detail PO, termasuk klien jika diperlukan.
                    </DialogDescription>
                  </DialogHeader>
                  
                  {editError && (
                    <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm mb-4">
                      {editError}
                    </div>
                  )}

                  <div className="grid gap-6 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="editClientSelect">Klien <span className="text-red-500">*</span></Label>
                        <select 
                          id="editClientSelect"
                          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          value={editClientId}
                          onChange={(e) => setEditClientId(e.target.value)}
                        >
                          <option value="" disabled>-- Pilih Klien --</option>
                          {clients.map(client => (
                            <option key={client.uid} value={client.uid}>{client.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="editNotes">Catatan Tambahan</Label>
                        <Input 
                          id="editNotes" 
                          placeholder="Contoh: Kirim pagi hari" 
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                        />
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label className="text-base">Daftar Barang <span className="text-red-500">*</span></Label>
                        <Button type="button" variant="outline" size="sm" onClick={handleAddEditItem}>
                          <Plus className="w-4 h-4 mr-2" /> Tambah Barang
                        </Button>
                      </div>
                      
                      <div className="border rounded-md overflow-x-auto">
                        <Table className="min-w-[800px]">
                          <TableHeader className="bg-slate-50">
                            <TableRow>
                              <TableHead>Nama Barang</TableHead>
                              <TableHead className="w-[100px]">Qty</TableHead>
                              <TableHead className="w-[120px]">Satuan</TableHead>
                              <TableHead className="w-[150px]">Harga Satuan</TableHead>
                              <TableHead>Supplier</TableHead>
                              <TableHead className="w-[50px]"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {editItems.map((item, index) => (
                              <TableRow key={index}>
                                <TableCell className="p-2">
                                  <Input 
                                    placeholder="Nama barang" 
                                    value={item.name}
                                    onChange={(e) => handleEditItemChange(index, 'name', e.target.value)}
                                  />
                                </TableCell>
                                <TableCell className="p-2">
                                  <Input 
                                    type="text" 
                                    value={item.quantity}
                                    onChange={(e) => {
                                      const val = e.target.value.replace(/,/g, '.');
                                      if (/^\d*\.?\d*$/.test(val)) {
                                        handleEditItemChange(index, 'quantity', val);
                                      }
                                    }}
                                  />
                                </TableCell>
                                <TableCell className="p-2">
                                  <select 
                                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                    value={item.unit}
                                    onChange={(e) => handleEditItemChange(index, 'unit', e.target.value)}
                                  >
                                    <option value="pcs">pcs</option>
                                    <option value="kg">kg</option>
                                    <option value="gram">gram</option>
                                    <option value="liter">liter</option>
                                    <option value="box">box</option>
                                    <option value="pack">pack</option>
                                    <option value="ikat">ikat</option>
                                  </select>
                                </TableCell>
                                <TableCell className="p-2">
                                  <Input 
                                    type="text" 
                                    placeholder="0"
                                    value={item.unitPrice ? new Intl.NumberFormat('id-ID').format(Number(item.unitPrice)) : ''}
                                    onChange={(e) => {
                                      const val = e.target.value.replace(/\./g, '');
                                      if (/^\d*$/.test(val)) {
                                        handleEditItemChange(index, 'unitPrice', val === '' ? 0 : parseInt(val));
                                      }
                                    }}
                                  />
                                </TableCell>
                                <TableCell className="p-2">
                                  {suppliers.length > 0 ? (
                                    <select
                                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                      value={item.supplier}
                                      onChange={(e) => handleEditItemChange(index, 'supplier', e.target.value)}
                                    >
                                      <option value="" disabled>Pilih Supplier</option>
                                      {suppliers.map(s => (
                                        <option key={s.id} value={s.name}>{s.name}</option>
                                      ))}
                                    </select>
                                  ) : (
                                    <Input 
                                      placeholder="Nama supplier" 
                                      value={item.supplier}
                                      onChange={(e) => handleEditItemChange(index, 'supplier', e.target.value)}
                                    />
                                  )}
                                </TableCell>
                                <TableCell className="p-2 text-center">
                                  <Button 
                                    type="button" 
                                    variant="ghost" 
                                    size="icon" 
                                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                    onClick={() => handleRemoveEditItem(index)}
                                    disabled={editItems.length === 1}
                                  >
                                    &times;
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </div>
                  
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsEditOpen(false)}>Batal</Button>
                    <Button onClick={handleUpdatePO} className="bg-indigo-600 hover:bg-indigo-700">Update PO</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

            {user.role === 'admin' && (
              <>
                <Dialog open={isNewClientOpen} onOpenChange={setIsNewClientOpen}>
                  <DialogTrigger render={<Button variant="outline" className="bg-white text-slate-700 border-slate-300 hover:bg-slate-50 shadow-sm" />}>
                    <Plus className="w-4 h-4 mr-2 hidden sm:block" />
                    Tambah Klien
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Tambah Klien Baru</DialogTitle>
                      <DialogDescription>
                        Masukkan data klien baru.
                      </DialogDescription>
                    </DialogHeader>

                    {clientError && (
                      <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm mb-4">
                        {clientError}
                      </div>
                    )}

                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="clientName">Nama Klien</Label>
                        <Input 
                          id="clientName" 
                          placeholder="Contoh: PT. Maju Jaya" 
                          value={newClientName}
                          onChange={(e) => setNewClientName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="clientPhone">Nomor Telepon</Label>
                        <Input 
                          id="clientPhone" 
                          type="tel"
                          placeholder="Contoh: 081234567890" 
                          value={newClientPhone}
                          onChange={(e) => setNewClientPhone(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="clientAddress">Alamat</Label>
                        <Input 
                          id="clientAddress" 
                          placeholder="Contoh: Jl. Sudirman No. 123, Jakarta" 
                          value={newClientAddress}
                          onChange={(e) => setNewClientAddress(e.target.value)}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsNewClientOpen(false)}>Batal</Button>
                      <Button onClick={handleCreateClient} className="bg-indigo-600 hover:bg-indigo-700">Simpan Klien</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                  <Dialog open={isSupplierManageOpen} onOpenChange={setIsSupplierManageOpen}>
                <DialogTrigger render={<Button variant="outline" className="bg-white text-slate-700 border-slate-300 hover:bg-slate-50 shadow-sm" />}>
                  <Package className="w-4 h-4 mr-2 hidden sm:block" />
                  Kelola Supplier
                </DialogTrigger>
                <DialogContent className="max-w-7xl sm:max-w-7xl w-[95vw] max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="text-2xl">Kelola Supplier</DialogTitle>
                    <DialogDescription className="text-base">
                      Kelola daftar supplier yang tersedia.
                    </DialogDescription>
                  </DialogHeader>
                  
                  <div className="py-4">
                    <div className="flex justify-end mb-4">
                      <Button onClick={() => setIsNewSupplierOpen(true)} className="bg-indigo-600 hover:bg-indigo-700">
                        <Plus className="w-4 h-4 mr-2" /> Tambah Supplier
                      </Button>
                    </div>
                    <div className="border rounded-md overflow-x-auto">
                      <Table className="min-w-[1000px]">
                        <TableHeader className="bg-slate-50">
                          <TableRow>
                            <TableHead className="text-base">Nama</TableHead>
                            <TableHead className="text-base">Telepon</TableHead>
                            <TableHead className="text-base">Alamat</TableHead>
                            <TableHead className="text-base">Kecamatan/Kabupaten</TableHead>
                            <TableHead className="w-[120px] text-center text-base">Aksi</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {suppliers.map((s) => (
                            <TableRow key={s.id}>
                              <TableCell className="font-medium text-base">{s.name}</TableCell>
                              <TableCell className="text-base">{s.phone || '-'}</TableCell>
                              <TableCell className="text-base">{s.address || '-'}</TableCell>
                              <TableCell className="text-base">{s.district || '-'}</TableCell>
                              <TableCell className="text-center">
                                <div className="flex justify-center gap-1">
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50"
                                    onClick={() => openEditSupplier(s)}
                                    title="Edit Supplier"
                                  >
                                    <Edit className="h-5 w-5" />
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                    onClick={() => setSupplierToDelete(s.id)}
                                    title="Hapus Supplier"
                                  >
                                    <Trash2 className="h-5 w-5" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                          {suppliers.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={5} className="text-center text-slate-500 py-4">Belum ada data supplier.</TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                  
                  <DialogFooter>
                    <Button onClick={() => setIsSupplierManageOpen(false)} className="bg-slate-800 hover:bg-slate-900">Tutup</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog open={isUserManageOpen} onOpenChange={setIsUserManageOpen}>
                <DialogTrigger render={<Button variant="outline" className="bg-white text-slate-700 border-slate-300 hover:bg-slate-50 shadow-sm" />}>
                  <UserIcon className="w-4 h-4 mr-2 hidden sm:block" />
                  Kelola Pengguna
                </DialogTrigger>
                <DialogContent className="max-w-7xl sm:max-w-7xl w-[95vw] max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="text-2xl">Kelola Akses Pengguna</DialogTitle>
                    <DialogDescription className="text-base">
                      Atur role untuk setiap email. Role menentukan akses mereka di aplikasi.
                    </DialogDescription>
                  </DialogHeader>
                  
                  <div className="py-4">
                    <div className="border rounded-md overflow-x-auto">
                      <Table className="min-w-[1000px]">
                        <TableHeader className="bg-slate-50">
                          <TableRow>
                            <TableHead className="text-base">Nama</TableHead>
                            <TableHead className="text-base">Email</TableHead>
                            <TableHead className="text-base">Telepon</TableHead>
                            <TableHead className="text-base">Alamat</TableHead>
                            <TableHead className="text-base">Kecamatan/Kabupaten</TableHead>
                            <TableHead className="w-[150px] text-base">Role</TableHead>
                            <TableHead className="w-[120px] text-center text-base">Aksi</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {allUsers.map((u) => (
                            <TableRow key={u.uid}>
                              <TableCell className="font-medium text-base">{u.name}</TableCell>
                              <TableCell className="text-base">{u.email}</TableCell>
                              <TableCell className="text-base">{u.phone || '-'}</TableCell>
                              <TableCell className="text-base">{u.address || '-'}</TableCell>
                              <TableCell className="text-base">{u.district || '-'}</TableCell>
                              <TableCell>
                                <select 
                                  className="flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer hover:bg-slate-50"
                                  value={u.role}
                                  onChange={(e) => handleUpdateUserRole(u.uid, e.target.value)}
                                >
                                  <option value="admin">Admin</option>
                                  <option value="kitchen">Kitchen</option>
                                  <option value="driver">Driver</option>
                                  <option value="client">Client</option>
                                </select>
                              </TableCell>
                              <TableCell className="text-center">
                                <div className="flex justify-center gap-1">
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50"
                                    onClick={() => openEditUser(u)}
                                    title="Edit Pengguna"
                                  >
                                    <Edit className="h-5 w-5" />
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                    onClick={() => setUserToDelete(u.uid)}
                                    title="Hapus Pengguna"
                                  >
                                    <Trash2 className="h-5 w-5" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                          {allUsers.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center text-slate-500 py-4">Memuat data pengguna...</TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                  
                  <DialogFooter>
                    <Button onClick={() => setIsUserManageOpen(false)} className="bg-slate-800 hover:bg-slate-900">Tutup</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog open={!!userToDelete} onOpenChange={(open) => !open && setUserToDelete(null)}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Konfirmasi Hapus Pengguna</DialogTitle>
                    <DialogDescription>
                      Apakah Anda yakin ingin menghapus pengguna ini? Tindakan ini tidak dapat dibatalkan.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter className="mt-4">
                    <Button variant="outline" onClick={() => setUserToDelete(null)}>Batal</Button>
                    <Button variant="destructive" onClick={handleDeleteUser}>Hapus Pengguna</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog open={isEditUserOpen} onOpenChange={setIsEditUserOpen}>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Edit Pengguna</DialogTitle>
                    <DialogDescription>
                      Ubah data pengguna.
                    </DialogDescription>
                  </DialogHeader>
                  
                  {editUserError && (
                    <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm mb-4">
                      {editUserError}
                    </div>
                  )}

                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="editUserName">Nama Pengguna <span className="text-red-500">*</span></Label>
                      <Input 
                        id="editUserName" 
                        value={editUserName}
                        onChange={(e) => setEditUserName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="editUserPhone">Telepon</Label>
                      <Input 
                        id="editUserPhone" 
                        value={editUserPhone}
                        onChange={(e) => setEditUserPhone(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="editUserAddress">Alamat</Label>
                      <Input 
                        id="editUserAddress" 
                        value={editUserAddress}
                        onChange={(e) => setEditUserAddress(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="editUserDistrict">Kecamatan/Kabupaten</Label>
                      <Input 
                        id="editUserDistrict" 
                        value={editUserDistrict}
                        onChange={(e) => setEditUserDistrict(e.target.value)}
                      />
                    </div>
                  </div>
                  
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsEditUserOpen(false)}>Batal</Button>
                    <Button onClick={handleUpdateUser} className="bg-indigo-600 hover:bg-indigo-700">Simpan Perubahan</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog open={!!supplierToDelete} onOpenChange={(open) => !open && setSupplierToDelete(null)}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Konfirmasi Hapus Supplier</DialogTitle>
                    <DialogDescription>
                      Apakah Anda yakin ingin menghapus supplier ini? Tindakan ini tidak dapat dibatalkan.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter className="mt-4">
                    <Button variant="outline" onClick={() => setSupplierToDelete(null)}>Batal</Button>
                    <Button variant="destructive" onClick={handleDeleteSupplier}>Hapus Supplier</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog open={isNewSupplierOpen} onOpenChange={setIsNewSupplierOpen}>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Tambah Supplier Baru</DialogTitle>
                    <DialogDescription>
                      Masukkan data supplier baru.
                    </DialogDescription>
                  </DialogHeader>
                  
                  {supplierError && (
                    <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm mb-4">
                      {supplierError}
                    </div>
                  )}

                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="supplierName">Nama Supplier <span className="text-red-500">*</span></Label>
                      <Input 
                        id="supplierName" 
                        value={supplierName}
                        onChange={(e) => setSupplierName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="supplierPhone">Telepon</Label>
                      <Input 
                        id="supplierPhone" 
                        value={supplierPhone}
                        onChange={(e) => setSupplierPhone(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="supplierAddress">Alamat</Label>
                      <Input 
                        id="supplierAddress" 
                        value={supplierAddress}
                        onChange={(e) => setSupplierAddress(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="supplierDistrict">Kecamatan/Kabupaten</Label>
                      <Input 
                        id="supplierDistrict" 
                        value={supplierDistrict}
                        onChange={(e) => setSupplierDistrict(e.target.value)}
                      />
                    </div>
                  </div>
                  
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsNewSupplierOpen(false)}>Batal</Button>
                    <Button onClick={handleCreateSupplier} className="bg-indigo-600 hover:bg-indigo-700">Simpan Supplier</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog open={isEditSupplierOpen} onOpenChange={setIsEditSupplierOpen}>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Edit Supplier</DialogTitle>
                    <DialogDescription>
                      Ubah data supplier.
                    </DialogDescription>
                  </DialogHeader>
                  
                  {supplierError && (
                    <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm mb-4">
                      {supplierError}
                    </div>
                  )}

                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="editSupplierName">Nama Supplier <span className="text-red-500">*</span></Label>
                      <Input 
                        id="editSupplierName" 
                        value={supplierName}
                        onChange={(e) => setSupplierName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="editSupplierPhone">Telepon</Label>
                      <Input 
                        id="editSupplierPhone" 
                        value={supplierPhone}
                        onChange={(e) => setSupplierPhone(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="editSupplierAddress">Alamat</Label>
                      <Input 
                        id="editSupplierAddress" 
                        value={supplierAddress}
                        onChange={(e) => setSupplierAddress(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="editSupplierDistrict">Kecamatan/Kabupaten</Label>
                      <Input 
                        id="editSupplierDistrict" 
                        value={supplierDistrict}
                        onChange={(e) => setSupplierDistrict(e.target.value)}
                      />
                    </div>
                  </div>
                  
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsEditSupplierOpen(false)}>Batal</Button>
                    <Button onClick={handleUpdateSupplier} className="bg-indigo-600 hover:bg-indigo-700">Simpan Perubahan</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog open={!!poToDelete} onOpenChange={(open) => !open && setPoToDelete(null)}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Konfirmasi Hapus PO</DialogTitle>
                    <DialogDescription>
                      Apakah Anda yakin ingin menghapus Purchase Order ini? Tindakan ini tidak dapat dibatalkan.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter className="mt-4">
                    <Button variant="outline" onClick={() => setPoToDelete(null)}>Batal</Button>
                    <Button variant="destructive" onClick={handleDeletePO}>Hapus PO</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              </>
            )}

            <div className="flex items-center gap-3 ml-4 pl-4 border-l border-slate-200">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-slate-800 leading-none">{user.name}</p>
                <p className="text-xs text-slate-500 mt-1">{user.email}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={handleLogout} title="Logout">
                <LogOut className="w-5 h-5 text-slate-500" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content - Kanban Board */}
      <main className="flex-1 overflow-x-auto p-6">
        {globalSuccess && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 p-4 rounded-lg mb-6 flex justify-between items-center">
            <span>{globalSuccess}</span>
            <Button variant="ghost" size="sm" onClick={() => setGlobalSuccess(null)}>Tutup</Button>
          </div>
        )}
        {globalError && (
          <div className="bg-red-50 border border-red-200 text-red-600 p-4 rounded-lg mb-6 flex justify-between items-center">
            <span>{globalError}</span>
            <Button variant="ghost" size="sm" onClick={() => setGlobalError(null)}>Tutup</Button>
          </div>
        )}
        <div className="flex gap-6 min-w-max pb-4">
          {renderKanbanColumn('PO_RECEIVED')}
          {renderKanbanColumn('ORDERING')}
          {renderKanbanColumn('DELIVERING')}
          {renderKanbanColumn('AT_KITCHEN')}
          {renderKanbanColumn('COMPLETED')}
          {user.role === 'admin' && renderKanbanColumn('INVOICED')}
        </div>
      </main>

      {/* Detail Modal */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-4xl sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          {selectedOrder && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between pr-6">
                  <DialogTitle className="text-xl flex items-center gap-3">
                    {selectedOrder.id}
                    <Badge className={statusConfig[selectedOrder.status].color} variant="outline">
                      {statusConfig[selectedOrder.status].label}
                    </Badge>
                  </DialogTitle>
                  <div className="flex gap-2">
                    {(selectedOrder.status === 'COMPLETED' || selectedOrder.status === 'INVOICED') && user.role === 'admin' && (
                      <Button variant="outline" size="sm" className="bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100" onClick={() => handleOpenInvoice(selectedOrder)}>
                        <Receipt className="w-4 h-4 mr-2" /> Cetak Nota
                      </Button>
                    )}
                    {user.role === 'admin' && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => openEditPO(selectedOrder)}>
                          <Edit className="w-4 h-4 mr-2" /> Edit PO
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => setPoToDelete(selectedOrder.id)}>
                          <Trash2 className="w-4 h-4 mr-2" /> Hapus PO
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                <DialogDescription className="text-slate-500 mt-1">
                  Diterima pada {new Date(selectedOrder.date).toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short' })}
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-6 py-4">
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                  <p className="text-sm text-slate-500 mb-1">Klien</p>
                  <p className="font-semibold text-slate-800 text-lg">{selectedOrder.clientName}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                  <p className="text-sm text-slate-500 mb-1">Catatan</p>
                  <p className="font-medium text-slate-700">{selectedOrder.notes || '-'}</p>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-semibold text-slate-800 text-lg border-b pb-2">Daftar Kebutuhan & Status</h3>
                
                <div className="border rounded-md overflow-x-auto">
                  <Table className="min-w-[800px]">
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead>Barang</TableHead>
                        {(user.role === 'admin' || user.role === 'kitchen' || user.role === 'driver') && <TableHead>Supplier</TableHead>}
                        <TableHead className="text-center w-[120px]">Diorder?</TableHead>
                        <TableHead className="text-center w-[120px]">Dikirim?</TableHead>
                        <TableHead className="text-center w-[120px]">Sampai Dapur?</TableHead>
                        <TableHead className="text-center w-[120px]">Diterima Klien?</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedOrder.items.map((item) => (
                        <TableRow key={item.id} className={item.isReceived ? 'bg-emerald-50/50' : ''}>
                          <TableCell>
                            <div className="font-medium text-slate-800">{item.name}</div>
                            <div className="text-xs text-slate-500">{item.quantity} {item.unit}</div>
                          </TableCell>
                          
                          {(user.role === 'admin' || user.role === 'kitchen' || user.role === 'driver') && (
                            <TableCell>
                              <Badge variant="outline" className="bg-white text-slate-600 font-normal">
                                {item.supplier}
                              </Badge>
                            </TableCell>
                          )}

                          <TableCell className="text-center">
                            <Button
                              variant={item.isOrdered ? "default" : "outline"}
                              size="sm"
                              disabled={user.role !== 'kitchen' && user.role !== 'admin'}
                              className={`w-full ${item.isOrdered ? 'bg-indigo-600 hover:bg-indigo-700' : 'text-slate-500'}`}
                              onClick={() => toggleItemStatus(selectedOrder.id, item.id, 'isOrdered')}
                            >
                              {item.isOrdered ? <CheckCircle2 className="w-4 h-4 mr-1" /> : <Clock className="w-4 h-4 mr-1" />}
                              {item.isOrdered ? 'Ya' : 'Belum'}
                            </Button>
                          </TableCell>

                          <TableCell className="text-center">
                            <Button
                              variant={item.isDelivered ? "default" : "outline"}
                              size="sm"
                              disabled={user.role !== 'driver' && user.role !== 'admin'}
                              className={`w-full ${item.isDelivered ? 'bg-blue-600 hover:bg-blue-700' : 'text-slate-500'}`}
                              onClick={() => toggleItemStatus(selectedOrder.id, item.id, 'isDelivered')}
                            >
                              {item.isDelivered ? <CheckCircle2 className="w-4 h-4 mr-1" /> : <Truck className="w-4 h-4 mr-1" />}
                              {item.isDelivered ? 'Ya' : 'Belum'}
                            </Button>
                          </TableCell>

                          <TableCell className="text-center">
                            <Button
                              variant={item.isAtKitchen ? "default" : "outline"}
                              size="sm"
                              disabled={user.role !== 'kitchen' && user.role !== 'admin' && user.role !== 'driver'}
                              className={`w-full ${item.isAtKitchen ? 'bg-orange-600 hover:bg-orange-700' : 'text-slate-500'}`}
                              onClick={() => toggleItemStatus(selectedOrder.id, item.id, 'isAtKitchen')}
                            >
                              {item.isAtKitchen ? <CheckCircle2 className="w-4 h-4 mr-1" /> : <Package className="w-4 h-4 mr-1" />}
                              {item.isAtKitchen ? 'Ya' : 'Belum'}
                            </Button>
                          </TableCell>

                          <TableCell className="text-center">
                            <Button
                              variant={item.isReceived ? "default" : "outline"}
                              size="sm"
                              disabled={user.role !== 'client' && user.role !== 'admin'}
                              className={`w-full ${item.isReceived ? 'bg-emerald-600 hover:bg-emerald-700' : 'text-slate-500'}`}
                              onClick={() => toggleItemStatus(selectedOrder.id, item.id, 'isReceived')}
                            >
                              {item.isReceived ? <CheckCircle2 className="w-4 h-4 mr-1" /> : <Clock className="w-4 h-4 mr-1" />}
                              {item.isReceived ? 'Ya' : 'Belum'}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

