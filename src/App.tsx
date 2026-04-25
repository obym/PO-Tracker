import React, { useState, useEffect } from 'react';
import { Plus, Search, FileText, Package, Truck, CheckCircle2, ChevronRight, ChevronLeft, ChevronDown, ChevronUp, ShoppingCart, Clock, LogOut, User as UserIcon, Trash2, Edit, Receipt, Printer, Download, MessageSquare, X } from 'lucide-react';
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
  category?: 'Bahan Baku' | 'Bahan Operasional';
  unitPrice?: number;
  hpp?: number;
  supplierCost?: number;
  isOrdered: boolean;
  isAtKitchen: boolean;
  isDelivered: boolean;
  isReceived: boolean;
  isTransferred?: boolean;
}

interface PurchaseOrder {
  id: string;
  poNumber?: string;
  deliveredBy?: 'Dikirim Koperasi' | 'Dikirim Supplier';
  deliveryDate?: string;
  invoiceDate?: string;
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
  picName?: string;
  phone?: string;
  address?: string;
  district?: string;
  bankAccount?: string;
}

interface UserProfile {
  uid: string;
  email: string;
  name: string;
  role: 'admin' | 'driver' | 'client' | 'supplier';
  phone?: string;
  address?: string;
  district?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
}

const statusConfig = {
  PO_RECEIVED: { label: 'PO Diterima', color: 'bg-blue-100 text-blue-800', icon: FileText },
  ORDERING: { label: 'Proses Order', color: 'bg-amber-100 text-amber-800', icon: ShoppingCart },
  DELIVERING: { label: 'Proses Kirim', color: 'bg-indigo-100 text-indigo-800', icon: Truck },
  AT_KITCHEN: { label: 'Sampai Dapur', color: 'bg-orange-100 text-orange-800', icon: Package },
  COMPLETED: { label: 'Selesai (Diterima Klien)', color: 'bg-emerald-100 text-emerald-800', icon: CheckCircle2 },
  INVOICED: { label: 'Nota Dibuat', color: 'bg-purple-100 text-purple-800', icon: Receipt },
};

const HppInput = ({ item, orderId, handleUpdateHpp }: { item: any, orderId: string, handleUpdateHpp: (orderId: string, itemId: string, hpp: number) => void }) => {
  const [value, setValue] = useState(item.hpp ? item.hpp.toLocaleString('id-ID') : '');

  useEffect(() => {
    setValue(item.hpp ? item.hpp.toLocaleString('id-ID') : '');
  }, [item.hpp]);

  return (
    <Input 
      type="text" 
      className="w-28 text-right ml-auto h-8"
      placeholder="0"
      value={value}
      onChange={(e) => {
        const rawValue = e.target.value.replace(/\D/g, '');
        if (rawValue) {
          setValue(parseInt(rawValue, 10).toLocaleString('id-ID'));
        } else {
          setValue('');
        }
      }}
      onBlur={() => {
        const rawValue = value.replace(/\D/g, '');
        const val = rawValue ? parseInt(rawValue, 10) : 0;
        if (val !== (item.hpp || 0)) {
          handleUpdateHpp(orderId, item.id, val);
        }
      }}
    />
  );
};

const SupplierCostInput = ({ item, orderId, handleUpdateSupplierCost }: { item: any, orderId: string, handleUpdateSupplierCost: (orderId: string, itemId: string, cost: number) => void }) => {
  const [value, setValue] = useState(item.supplierCost ? item.supplierCost.toLocaleString('id-ID') : '');

  useEffect(() => {
    setValue(item.supplierCost ? item.supplierCost.toLocaleString('id-ID') : '');
  }, [item.supplierCost]);

  return (
    <Input 
      type="text" 
      className="w-28 text-right ml-auto h-8"
      placeholder="0"
      value={value}
      onChange={(e) => {
        const rawValue = e.target.value.replace(/\D/g, '');
        if (rawValue) {
          setValue(parseInt(rawValue, 10).toLocaleString('id-ID'));
        } else {
          setValue('');
        }
      }}
      onBlur={() => {
        const rawValue = value.replace(/\D/g, '');
        const val = rawValue ? parseInt(rawValue, 10) : 0;
        if (val !== (item.supplierCost || 0)) {
          handleUpdateSupplierCost(orderId, item.id, val);
        }
      }}
    />
  );
};

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [clients, setClients] = useState<UserProfile[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [currentView, setCurrentView] = useState<'kanban' | 'finance'>('kanban');
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [isClientNewPoOpen, setIsClientNewPoOpen] = useState(false);
  const [isUserManageOpen, setIsUserManageOpen] = useState(false);
  const [isSupplierManageOpen, setIsSupplierManageOpen] = useState(false);
  const [isNewClientOpen, setIsNewClientOpen] = useState(false);
  const [isProductHistoryOpen, setIsProductHistoryOpen] = useState(false);
  const [productHistorySearchTerm, setProductHistorySearchTerm] = useState('');
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  const [expandedFinanceCards, setExpandedFinanceCards] = useState<Record<string, boolean>>({});

  const toggleCardExpand = (e: React.MouseEvent, orderId: string) => {
    e.stopPropagation();
    setExpandedCards(prev => ({ ...prev, [orderId]: !prev[orderId] }));
  };

  const toggleFinanceCardExpand = (orderId: string) => {
    setExpandedFinanceCards(prev => ({ ...prev, [orderId]: !prev[orderId] }));
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchQuery.trim() !== '') {
      setProductHistorySearchTerm(searchQuery.trim());
      setIsProductHistoryOpen(true);
    }
  };
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
  const [editUserBankAccountName, setEditUserBankAccountName] = useState('');
  const [editUserBankAccountNumber, setEditUserBankAccountNumber] = useState('');
  const [editUserError, setEditUserError] = useState<string | null>(null);

  // Supplier State
  const [isEditSupplierOpen, setIsEditSupplierOpen] = useState(false);
  const [isNewSupplierOpen, setIsNewSupplierOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [supplierName, setSupplierName] = useState('');
  const [supplierPicName, setSupplierPicName] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [supplierAddress, setSupplierAddress] = useState('');
  const [supplierDistrict, setSupplierDistrict] = useState('');
  const [supplierBankAccount, setSupplierBankAccount] = useState('');
  const [supplierError, setSupplierError] = useState<string | null>(null);

  // New PO Form State
  const [newClientId, setNewClientId] = useState('');
  const [newPoNumber, setNewPoNumber] = useState('');
  const [newPoDate, setNewPoDate] = useState(new Date().toISOString().split('T')[0]);
  const [newInvoiceDate, setNewInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [newDeliveryDate, setNewDeliveryDate] = useState('');
  const [newDeliveredBy, setNewDeliveredBy] = useState<'Dikirim Koperasi' | 'Dikirim Supplier'>('Dikirim Koperasi');
  const [newNotes, setNewNotes] = useState('');
  const [newItems, setNewItems] = useState<Omit<OrderItem, 'id' | 'isOrdered' | 'isAtKitchen' | 'isDelivered' | 'isReceived' | 'isTransferred'>[]>([
    { name: '', quantity: 1, unit: 'pcs', supplier: '', category: 'Bahan Baku', unitPrice: 0 }
  ]);

  // Client New PO Form State
  const [clientPoNumber, setClientPoNumber] = useState('');
  const [clientPoDate, setClientPoDate] = useState(new Date().toISOString().split('T')[0]);
  const [clientDeliveryDate, setClientDeliveryDate] = useState('');
  const [clientItems, setClientItems] = useState<{name: string, quantity: number | string, unit: string, category: 'Bahan Baku' | 'Bahan Operasional', supplier: string}>([
    { name: '', quantity: 1, unit: 'pcs', category: 'Bahan Baku', supplier: '' }
  ]);

  // Client Edit PO Form State
  const [isClientEditPoOpen, setIsClientEditPoOpen] = useState(false);
  const [clientEditPoNumber, setClientEditPoNumber] = useState('');
  const [clientEditPoDate, setClientEditPoDate] = useState(new Date().toISOString().split('T')[0]);
  const [clientEditDeliveryDate, setClientEditDeliveryDate] = useState('');
  const [clientEditItems, setClientEditItems] = useState<{id?: string, name: string, quantity: number | string, unit: string, category: 'Bahan Baku' | 'Bahan Operasional', supplier: string}[]>([]);

  // Edit PO Form State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingPO, setEditingPO] = useState<PurchaseOrder | null>(null);
  const [editClientId, setEditClientId] = useState('');
  const [editPoNumber, setEditPoNumber] = useState('');
  const [editPoDate, setEditPoDate] = useState('');
  const [editInvoiceDate, setEditInvoiceDate] = useState('');
  const [editDeliveryDate, setEditDeliveryDate] = useState('');
  const [editDeliveredBy, setEditDeliveredBy] = useState<'Dikirim Koperasi' | 'Dikirim Supplier'>('Dikirim Koperasi');
  const [editNotes, setEditNotes] = useState('');
  const [editItems, setEditItems] = useState<OrderItem[]>([]);
  const [editError, setEditError] = useState<string | null>(null);

  // Invoice State
  const [invoiceOrder, setInvoiceOrder] = useState<PurchaseOrder | null>(null);
  const [selectedInvoiceItems, setSelectedInvoiceItems] = useState<string[]>([]);
  const [rekapSupplierData, setRekapSupplierData] = useState<{order: PurchaseOrder, supplierName: string, invoiceNumber: string} | null>(null);

  // New Client Form State
  const [newClientName, setNewClientName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [newClientAddress, setNewClientAddress] = useState('');
  const [clientError, setClientError] = useState<string | null>(null);
  const [newPoError, setNewPoError] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [globalSuccess, setGlobalSuccess] = useState<string | null>(null);

  // Back button trap to return to dashboard
  useEffect(() => {
    if (user) {
      window.history.pushState(null, '', window.location.href);
      const handlePopState = () => {
        // Trap again
        window.history.pushState(null, '', window.location.href);
        
        // Close all sub-views/modals
        setIsDetailOpen(false);
        setIsNewOpen(false);
        setIsClientNewPoOpen(false);
        setIsUserManageOpen(false);
        setIsSupplierManageOpen(false);
        setIsNewClientOpen(false);
        setIsProductHistoryOpen(false);
        setIsEditUserOpen(false);
        setIsEditSupplierOpen(false);
        setIsNewSupplierOpen(false);
        setIsClientEditPoOpen(false);
        setIsEditOpen(false);
        setInvoiceOrder(null);
        setRekapSupplierData(null);
        setUserToDelete(null);
        setPoToDelete(null);
        setSupplierToDelete(null);
        
        // Reset view to dashboard
        setCurrentView('kanban');
      };
      
      window.addEventListener('popstate', handlePopState);
      return () => window.removeEventListener('popstate', handlePopState);
    }
  }, [user]);

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

    const allUsersQuery = query(collection(db, 'users'));
    const unsubscribeAllUsers = onSnapshot(allUsersQuery, (snapshot) => {
      setAllUsers(snapshot.docs.map(doc => doc.data() as UserProfile));
    });

    let unsubscribeClients = () => {};
    let unsubscribeSuppliers = () => {};
    if (user.role === 'admin') {
      const clientsQuery = query(collection(db, 'users'), where('role', '==', 'client'));
      unsubscribeClients = onSnapshot(clientsQuery, (snapshot) => {
        setClients(snapshot.docs.map(doc => doc.data() as UserProfile));
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
    setNewItems([...newItems, { name: '', quantity: 1, unit: 'pcs', supplier: '', category: 'Bahan Baku', unitPrice: 0 }]);
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
      
      if (newRole === 'supplier') {
        const userToUpdate = allUsers.find(u => u.uid === userId);
        if (userToUpdate && userToUpdate.name) {
          const supplierExists = suppliers.some(s => s.name.toLowerCase() === userToUpdate.name.toLowerCase());
          if (!supplierExists) {
            const newId = `supplier-${Date.now()}`;
            const newSupplier: Supplier = {
              id: newId,
              name: userToUpdate.name,
              picName: userToUpdate.name,
              phone: userToUpdate.phone || '',
              address: userToUpdate.address || '',
              district: userToUpdate.district || ''
            };
            await setDoc(doc(db, 'suppliers', newId), newSupplier);
          }
        }
      }
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
    setEditUserBankAccountName(user.bankAccountName || '');
    setEditUserBankAccountNumber(user.bankAccountNumber || '');
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
        district: editUserDistrict,
        bankAccountName: editUserBankAccountName,
        bankAccountNumber: editUserBankAccountNumber
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
        picName: supplierPicName,
        phone: supplierPhone,
        address: supplierAddress,
        district: supplierDistrict,
        bankAccount: supplierBankAccount
      };
      
      await setDoc(doc(db, 'suppliers', newId), newSupplier);
      setIsNewSupplierOpen(false);
      setSupplierName('');
      setSupplierPicName('');
      setSupplierPhone('');
      setSupplierAddress('');
      setSupplierDistrict('');
      setSupplierBankAccount('');
    } catch (error) {
      console.error("Error creating supplier:", error);
      setSupplierError("Gagal membuat supplier. Pastikan Anda memiliki akses Admin.");
    }
  };

  const openEditSupplier = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setSupplierName(supplier.name);
    setSupplierPicName(supplier.picName || '');
    setSupplierPhone(supplier.phone || '');
    setSupplierAddress(supplier.address || '');
    setSupplierDistrict(supplier.district || '');
    setSupplierBankAccount(supplier.bankAccount || '');
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
        picName: supplierPicName,
        phone: supplierPhone,
        address: supplierAddress,
        district: supplierDistrict,
        bankAccount: supplierBankAccount
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

    const uniqueId = `PO-${new Date().getFullYear()}-${Date.now()}`;
    
    const newPO: PurchaseOrder | any = {
      id: uniqueId,
      poNumber: newPoNumber || uniqueId,
      deliveredBy: newDeliveredBy,
      deliveryDate: newDeliveryDate ? new Date(newDeliveryDate).toISOString() : null,
      invoiceDate: newInvoiceDate ? new Date(newInvoiceDate).toISOString() : null,
      clientId: client.uid,
      clientName: client.name,
      date: new Date(newPoDate).toISOString(),
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
        isTransferred: false,
      })),
    };

    try {
      await setDoc(doc(db, 'purchaseOrders', newPO.id), newPO);
      setIsNewOpen(false);
      setNewClientId('');
      setNewPoNumber('');
      setNewDeliveredBy('Dikirim Koperasi');
      setNewNotes('');
      setNewInvoiceDate(new Date().toISOString().split('T')[0]);
      setNewItems([{ name: '', quantity: 1, unit: 'pcs', supplier: '', unitPrice: 0 }]);
    } catch (error) {
      console.error("Error creating PO:", error);
      setNewPoError("Gagal membuat PO. Pastikan Anda memiliki akses Admin.");
    }
  };

  const handleClientCreatePO = async () => {
    setNewPoError(null);
    if (clientItems.length === 0 || clientItems.some(i => !i.name)) {
      setNewPoError('Mohon lengkapi daftar barang (Nama Barang wajib diisi).');
      return;
    }

    if (!user) return;

    const uniqueId = `PO-${new Date().getFullYear()}-${Date.now()}`;
    const formattedDatePart = new Date().toISOString().split('T')[0].replace(/-/g, '').slice(2);
    const orderCountString = String(orders.length + 1).padStart(3, '0');

    const newPO: PurchaseOrder | any = {
      id: uniqueId,
      poNumber: clientPoNumber || `PO-${formattedDatePart}-${orderCountString}`,
      deliveredBy: 'Dikirim Koperasi',
      deliveryDate: clientDeliveryDate ? new Date(clientDeliveryDate).toISOString() : null,
      invoiceDate: new Date(clientPoDate).toISOString(),
      clientId: user.uid,
      clientName: user.name,
      date: new Date(clientPoDate).toISOString(),
      status: 'PO_RECEIVED',
      notes: '',
      items: clientItems.map((item, i) => ({
        id: `i-${Date.now()}-${i}`,
        name: item.name,
        quantity: typeof item.quantity === 'string' ? parseFloat(item.quantity) || 0 : item.quantity,
        unit: item.unit,
        supplier: item.supplier || 'Belum Ditentukan',
        category: item.category,
        unitPrice: 0,
        isOrdered: false,
        isAtKitchen: false,
        isDelivered: false,
        isReceived: false,
        isTransferred: false,
      })),
    };

    try {
      await setDoc(doc(db, 'purchaseOrders', newPO.id), newPO);
      setIsClientNewPoOpen(false);
      setClientPoNumber('');
      setClientPoDate(new Date().toISOString().split('T')[0]);
      setClientDeliveryDate('');
      setClientItems([{ name: '', quantity: 1, unit: 'pcs', category: 'Bahan Baku', supplier: '' }]);
    } catch (error: any) {
      console.error("Error creating PO from client:", error);
      setNewPoError("Gagal membuat PO. " + (error.message || "Periksa koneksi Anda."));
    }
  };

  const openEditPO = (po: PurchaseOrder) => {
    if (user?.role === 'client') {
      if (po.status !== 'PO_RECEIVED' && po.status !== 'ORDERING') {
         setGlobalError('PO ini sudah diproses dan tidak dapat diedit lagi.');
         return;
      }
      setEditingPO(po);
      setClientEditPoNumber(po.poNumber || '');
      setClientEditPoDate(new Date(po.date).toISOString().split('T')[0]);
      setClientEditDeliveryDate(po.deliveryDate ? new Date(po.deliveryDate).toISOString().split('T')[0] : '');
      setClientEditItems(po.items.map(item => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        category: (item.category as 'Bahan Baku' | 'Bahan Operasional') || 'Bahan Baku',
        supplier: item.supplier !== 'Belum Ditentukan' ? item.supplier : ''
      })));
      setEditError(null);
      setIsClientEditPoOpen(true);
      return;
    }

    if (user?.role !== 'admin') return;
    setEditingPO(po);
    setEditClientId(po.clientId);
    setEditPoNumber(po.poNumber || '');
    setEditPoDate(new Date(po.date).toISOString().split('T')[0]);
    setEditInvoiceDate(po.invoiceDate ? new Date(po.invoiceDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
    setEditDeliveryDate(po.deliveryDate ? new Date(po.deliveryDate).toISOString().split('T')[0] : '');
    setEditDeliveredBy(po.deliveredBy || 'Dikirim Koperasi');
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
      name: '', quantity: 1, unit: 'pcs', supplier: '', category: 'Bahan Baku', unitPrice: 0,
      isOrdered: false, isAtKitchen: false, isDelivered: false, isReceived: false, isTransferred: false
    }]);
  };

  const handleRemoveEditItem = (index: number) => {
    setEditItems(editItems.filter((_, i) => i !== index));
  };

  const handleUpdateHpp = async (orderId: string, itemId: string, hppValue: number) => {
    try {
      const order = orders.find(o => o.id === orderId);
      if (!order) return;
      
      const updatedItems = order.items.map(item => 
        item.id === itemId ? { ...item, hpp: hppValue } : item
      );
      
      await updateDoc(doc(db, 'purchaseOrders', orderId), {
        items: updatedItems
      });
      setGlobalSuccess('Harga Berhasil Disimpan.');
      setTimeout(() => setGlobalSuccess(null), 3000);
    } catch (error) {
      console.error("Error updating HPP:", error);
      setGlobalError('Gagal menyimpan harga.');
    }
  };

  const handleUpdateSupplierCost = async (orderId: string, itemId: string, costValue: number) => {
    try {
      const order = orders.find(o => o.id === orderId);
      if (!order) return;
      
      const updatedItems = order.items.map(item => 
        item.id === itemId ? { ...item, supplierCost: costValue, unitPrice: costValue } : item
      );
      
      await updateDoc(doc(db, 'purchaseOrders', orderId), {
        items: updatedItems
      });
      setGlobalSuccess('Harga Perolehan berhasil disimpan.');
      setTimeout(() => setGlobalSuccess(null), 3000);
    } catch (error) {
      console.error("Error updating Supplier Cost:", error);
      setGlobalError('Gagal menyimpan harga perolehan.');
    }
  };

  const handleClientUpdatePO = async () => {
    setEditError(null);
    if (!editingPO) return;
    
    if (clientEditItems.length === 0 || clientEditItems.some(i => !i.name)) {
      setEditError('Mohon lengkapi daftar barang (Nama Barang wajib diisi).');
      return;
    }

    if (editingPO.status !== 'PO_RECEIVED' && editingPO.status !== 'ORDERING') {
      setEditError('PO ini sudah diproses dan tidak dapat diedit lagi.');
      return;
    }

    try {
      const existingItemsIdMap = new Map<string, OrderItem>(editingPO.items.map(item => [item.id, item]));

      const updatedItems = clientEditItems.map((item, i) => {
        const id = item.id || `i-${Date.now()}-${i}`;
        const existingItem = existingItemsIdMap.get(id);
        
        return {
          id: id,
          name: item.name,
          quantity: typeof item.quantity === 'string' ? parseFloat(item.quantity) || 0 : item.quantity,
          unit: item.unit,
          category: item.category,
          // Update supplier from client if provided, otherwise preserve existing or default
          supplier: item.supplier || existingItem?.supplier || 'Belum Ditentukan',
          // Preserve server-side flags and other fields not editable by client
          unitPrice: existingItem?.unitPrice || 0,
          isOrdered: existingItem?.isOrdered || false,
          isAtKitchen: existingItem?.isAtKitchen || false,
          isDelivered: existingItem?.isDelivered || false,
          isReceived: existingItem?.isReceived || false,
          isTransferred: existingItem?.isTransferred || false,
        };
      });

      const updatedData: any = {
        poNumber: clientEditPoNumber,
        date: new Date(clientEditPoDate).toISOString(),
        invoiceDate: new Date(clientEditPoDate).toISOString(),
        deliveryDate: clientEditDeliveryDate ? new Date(clientEditDeliveryDate).toISOString() : null,
        items: updatedItems
      };
      
      await updateDoc(doc(db, 'purchaseOrders', editingPO.id), updatedData);
      setIsClientEditPoOpen(false);
      setEditingPO(null);
    } catch (error) {
      console.error("Error updating PO from client:", error);
      setEditError("Gagal memperbarui PO. Periksa koneksi Anda.");
    }
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
      const updatedData = {
        clientId: client.uid,
        clientName: client.name,
        poNumber: editPoNumber,
        date: new Date(editPoDate).toISOString(),
        invoiceDate: editInvoiceDate ? new Date(editInvoiceDate).toISOString() : null,
        deliveryDate: editDeliveryDate ? new Date(editDeliveryDate).toISOString() : null,
        deliveredBy: editDeliveredBy,
        notes: editNotes,
        items: editItems.map(item => ({
          ...item,
          quantity: typeof item.quantity === 'string' ? parseFloat(item.quantity) || 0 : item.quantity
        }))
      };
      await updateDoc(doc(db, 'purchaseOrders', editingPO.id), updatedData);
      
      if (selectedOrder && selectedOrder.id === editingPO.id) {
        setSelectedOrder({ ...selectedOrder, ...updatedData } as PurchaseOrder);
      }
      
      setIsEditOpen(false);
      setEditingPO(null);
    } catch (error) {
      console.error("Error updating PO:", error);
      setEditError("Gagal memperbarui PO. Pastikan Anda memiliki akses.");
    }
  };

  const handleOpenInvoice = async (order: PurchaseOrder) => {
    setInvoiceOrder(order);
    setSelectedInvoiceItems(order.items.map(item => item.id));
    setIsDetailOpen(false); // Close detail modal
  };

  const handlePrintInvoice = async () => {
    let orderToUpdate: string | null = null;
    let currentStatus: string | null = null;
    
    if (invoiceOrder && invoiceOrder.status === 'COMPLETED') {
      orderToUpdate = invoiceOrder.id;
      currentStatus = invoiceOrder.status;
    } else if (rekapSupplierData && rekapSupplierData.order.status === 'COMPLETED') {
      orderToUpdate = rekapSupplierData.order.id;
      currentStatus = rekapSupplierData.order.status;
    }

    if (orderToUpdate && currentStatus === 'COMPLETED' && (user?.role === 'admin' || user?.role === 'client')) {
      try {
        await updateDoc(doc(db, 'purchaseOrders', orderToUpdate), {
          status: 'INVOICED'
        });
        if (invoiceOrder && invoiceOrder.id === orderToUpdate) {
          setInvoiceOrder({...invoiceOrder, status: 'INVOICED'} as PurchaseOrder);
        }
        if (rekapSupplierData && rekapSupplierData.order.id === orderToUpdate) {
          setRekapSupplierData({...rekapSupplierData, order: {...rekapSupplierData.order, status: 'INVOICED'}});
        }
      } catch (error) {
        console.error("Error updating status to INVOICED:", error);
      }
    }

    setTimeout(() => {
      window.print();
    }, 100);
  };

  const generateSupplierInvoiceNumber = (orderId: string, supplierName: string, orderDateStr?: string) => {
    const supplierOrders = orders
      .filter(o => o.items.some(i => i.supplier === supplierName))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    const seqIndex = supplierOrders.findIndex(o => o.id === orderId);
    const seqNum = seqIndex >= 0 ? seqIndex + 1 : 1;
    const seqNumString = seqNum.toString().padStart(3, '0');

    const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase();
    const romanMonths = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
    const refDate = orderDateStr ? new Date(orderDateStr) : new Date();
    const currentMonth = romanMonths[refDate.getMonth()];
    const currentYear = refDate.getFullYear();
    return `${seqNumString}/${getInitials(supplierName)}/${currentMonth}/${currentYear}`;
  };

  const handleRekapSupplier = (supplierName: string) => {
    if (!selectedOrder) return;
    
    const supplierItems = selectedOrder.items.filter(item => item.supplier === supplierName);
    if (supplierItems.length === 0) return;

    const invoiceNumber = generateSupplierInvoiceNumber(selectedOrder.id, supplierName, selectedOrder.date);

    setRekapSupplierData({ order: selectedOrder, supplierName, invoiceNumber });
    setIsDetailOpen(false);
  };

  const handleExportToExcel = () => {
    const invoicedOrders = orders.filter(o => o.status === 'INVOICED').sort((a, b) => {
      const poA = a.poNumber || a.id;
      const poB = b.poNumber || b.id;
      return poB.localeCompare(poA, undefined, { numeric: true, sensitivity: 'base' });
    });
    if (invoicedOrders.length === 0) return;

    let csvContent = "data:text/csv;charset=utf-8,";
    
    // Header
    csvContent += "Nomor PO,Klien,Tanggal,Barang,Qty,Satuan,Harga Jual,HPP,Keuntungan\n";

    let grandTotalProfit = 0;

    invoicedOrders.forEach(order => {
      let orderTotalProfit = 0;
      const poNumber = order.poNumber || order.id;
      const clientName = order.clientName.replace(/,/g, ''); // Remove commas to avoid CSV issues
      const date = new Date(order.invoiceDate || order.date).toLocaleDateString('id-ID');

      order.items.forEach(item => {
        const itemName = item.name.replace(/,/g, '');
        const qty = typeof item.quantity === 'string' ? parseFloat(item.quantity) : item.quantity;
        const unit = item.unit.replace(/,/g, '');
        const price = item.unitPrice || 0;
        const hpp = item.hpp || 0;
        const profit = (price - hpp) * qty;

        orderTotalProfit += profit;
        
        csvContent += `"${poNumber}","${clientName}","${date}","${itemName}",${qty},"${unit}",${price},${hpp},${profit}\n`;
      });

      grandTotalProfit += orderTotalProfit;
      // Add a subtotal row for the PO
      csvContent += `,,,Total PO ${poNumber},,,,,${orderTotalProfit}\n`;
    });

    // Add Grand Total
    csvContent += `\n,,,TOTAL KESELURUHAN,,,,,${grandTotalProfit}\n`;

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Laporan_Keuangan_PO_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
    if (order.status === 'INVOICED') {
      newStatus = 'INVOICED';
    } else if (allReceived) {
      newStatus = 'COMPLETED';
    } else if (allAtKitchen) {
      newStatus = 'AT_KITCHEN';
    } else if (allDelivered) {
      newStatus = 'DELIVERING'; 
    } else if (allOrdered) {
      newStatus = 'DELIVERING';
    } else if (someOrdered) {
      newStatus = 'ORDERING';
    } else {
      newStatus = 'PO_RECEIVED';
    }

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
        <Card className="w-[400px] shadow-lg p-0 gap-0">
          <CardHeader className="text-center p-6">
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
          <CardContent className="flex justify-center p-6 pt-0">
            <Button onClick={handleLogin} className="w-full bg-indigo-600 hover:bg-indigo-700">
              Login dengan Google
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (rekapSupplierData) {
    const { order, supplierName, invoiceNumber } = rekapSupplierData;
    const supplierItems = order.items.filter(item => item.supplier === supplierName);

    return (
      <div className="min-h-screen bg-slate-100 flex flex-col">
        {/* Print controls (hidden in print) */}
         <div className="print:hidden p-4 border-b border-slate-200 flex justify-between items-center bg-white shadow-sm sticky top-0 z-10">
           <Button variant="outline" onClick={() => {
             setRekapSupplierData(null);
             setIsDetailOpen(true);
           }}>
             <ChevronLeft className="w-4 h-4 mr-2" /> Kembali
           </Button>
           <Button onClick={handlePrintInvoice} className="bg-indigo-600 hover:bg-indigo-700">
             <Printer className="w-4 h-4 mr-2" /> Cetak Nota
           </Button>
        </div>
        
        {/* Rekap content */}
        <div className="flex-1 p-2 sm:p-8 overflow-auto flex justify-center">
          <div id="print-area" className="bg-white text-black p-4 sm:p-12 font-sans text-xs sm:text-sm w-full max-w-4xl shadow-lg border border-slate-200 overflow-x-auto">
            <div className="min-w-[600px]">
              {/* Header */}
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold border-2 border-black inline-block px-16 py-1 mb-2 tracking-widest">NOTA</h1>
              <h2 className="text-xl font-bold uppercase">{supplierName}</h2>
              <p>{allUsers.find(u => u.name === supplierName)?.address || ''}</p>
              <p>{allUsers.find(u => u.name === supplierName)?.district || ''}</p>
              <p>{allUsers.find(u => u.name === supplierName)?.phone ? `Phone : ${allUsers.find(u => u.name === supplierName)?.phone}` : ''}</p>
            </div>

            {/* Info */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <table className="w-full">
                  <tbody>
                    <tr>
                      <td className="w-24">Nomor Nota</td>
                      <td className="w-4">:</td>
                      <td>{invoiceNumber}</td>
                    </tr>
                    <tr>
                      <td>Tanggal Order</td>
                      <td>:</td>
                      <td>{new Date(order.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</td>
                    </tr>
                    {order.deliveryDate && (
                      <tr>
                        <td>Tanggal Kirim</td>
                        <td>:</td>
                        <td>{new Date(order.deliveryDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div>
                <p className="font-bold">Kepada :</p>
                <p className="font-bold">{allUsers.find(c => c.uid === order.clientId)?.name || order.clientName}</p>
                {allUsers.find(c => c.uid === order.clientId)?.address && (
                  <p>{allUsers.find(c => c.uid === order.clientId)?.address}</p>
                )}
                {allUsers.find(c => c.uid === order.clientId)?.district && (
                  <p>{allUsers.find(c => c.uid === order.clientId)?.district}</p>
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
                {supplierItems.map((item, index) => {
                  const qty = typeof item.quantity === 'string' ? parseFloat(item.quantity) : item.quantity;
                  const price = item.supplierCost || 0;
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
                  <td className="border border-black p-2 text-right font-bold bg-gray-200">TOTAL KESELURUHAN</td>
                  <td className="border border-black p-2 text-right font-bold bg-gray-200">
                    {supplierItems.reduce((sum, item) => {
                      const qty = typeof item.quantity === 'string' ? parseFloat(item.quantity) : item.quantity;
                      const price = item.supplierCost || 0;
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
                {terbilang(supplierItems.reduce((sum, item) => {
                  const qty = typeof item.quantity === 'string' ? parseFloat(item.quantity) : item.quantity;
                  const price = item.supplierCost || 0;
                  return sum + (qty * price);
                }, 0))} Rupiah
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-between mt-8">
              <div>
                <p>BANK TRANSFER :</p>
                {(() => {
                  const sUser = allUsers.find(u => u.name === supplierName);
                  if (sUser?.bankAccountName || sUser?.bankAccountNumber) {
                    return (
                      <>
                        <p>Rekening {sUser.bankAccountName || '-'}</p>
                        <p>{sUser.bankAccountNumber || '-'}</p>
                      </>
                    );
                  }
                  return <p>-</p>;
                })()}
              </div>
              <div className="text-center mr-12 w-48">
                <p className="mb-16">Hormat Kami,</p>
                <div className="border-b border-black font-semibold text-sm pb-1 min-h-[24px]"></div>
              </div>
            </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (invoiceOrder) {
    const printableItems = invoiceOrder.items.filter(item => selectedInvoiceItems.includes(item.id));
    
    return (
      <div className="h-screen bg-slate-100 flex flex-col overflow-hidden">
        {/* Print controls (hidden in print) */}
        <div className="print:hidden p-4 border-b border-slate-200 flex justify-between items-center bg-white shadow-sm z-20 shrink-0">
           <Button variant="outline" onClick={() => setInvoiceOrder(null)}>
             <ChevronLeft className="w-4 h-4 mr-2" /> Kembali
           </Button>
           {user?.role === 'admin' && (
             <Button onClick={handlePrintInvoice} className="bg-indigo-600 hover:bg-indigo-700">
               <Printer className="w-4 h-4 mr-2" /> Cetak Nota
             </Button>
           )}
           {user?.role === 'client' && (
             <Button onClick={handlePrintInvoice} className="bg-indigo-600 hover:bg-indigo-700">
               <Printer className="w-4 h-4 mr-2" /> Cetak Nota
             </Button>
           )}
        </div>
        
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden print:block print:overflow-visible">
          {/* Selection Area (hidden in print) - Admin Only */}
          {user?.role === 'admin' && (
            <div className="print:hidden w-full md:w-80 lg:w-96 bg-white border-r border-slate-200 p-4 flex flex-col shadow-lg z-10 shrink-0 overflow-y-auto max-h-[300px] md:max-h-full">
               <h3 className="font-bold text-slate-800 mb-4 text-sm flex items-center gap-2">
                 <CheckCircle2 className="w-4 h-4 text-indigo-600" /> Pilih Barang Dicetak:
               </h3>
               <div className="flex gap-2 mb-4">
                 <Button 
                    variant="outline" 
                    size="sm" 
                    className="bg-indigo-50 text-xs h-8 hover:bg-indigo-100 border-indigo-200 text-indigo-700 flex-1"
                    onClick={() => setSelectedInvoiceItems(invoiceOrder.items.map(i => i.id))}
                 >
                    Pilih Semua
                 </Button>
                 <Button 
                    variant="outline" 
                    size="sm" 
                    className="bg-red-50 text-xs h-8 hover:bg-red-100 border-red-200 text-red-600 flex-1"
                    onClick={() => setSelectedInvoiceItems([])}
                 >
                    Hapus Semua
                 </Button>
               </div>
               <div className="flex flex-col gap-2 overflow-y-auto pr-1 pb-4">
                 {invoiceOrder.items.map((item, i) => (
                    <label key={item.id} className="flex items-start gap-3 text-sm text-slate-700 bg-slate-50 hover:bg-indigo-50/50 p-3 rounded-lg border border-slate-200 cursor-pointer transition-colors shadow-sm">
                      <input 
                        type="checkbox" 
                        className="mt-1 shrink-0 accent-indigo-600 w-4 h-4 cursor-pointer"
                        checked={selectedInvoiceItems.includes(item.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedInvoiceItems([...selectedInvoiceItems, item.id]);
                          } else {
                            setSelectedInvoiceItems(selectedInvoiceItems.filter(id => id !== item.id));
                          }
                        }}
                      />
                      <div className="flex-1">
                        <span className="font-semibold text-slate-800">{item.name}</span>
                        <span className="text-slate-500 font-medium text-xs mt-1 block">Qty: {item.quantity} {item.unit}</span>
                      </div>
                    </label>
                 ))}
               </div>
            </div>
          )}
          
          {/* Invoice content */}
          <div className="flex-1 p-4 sm:p-8 overflow-y-auto flex justify-center bg-slate-200/60 print:p-0 print:bg-white print:block">
            <div id="print-area" className="w-full max-w-4xl mx-auto h-fit">
              {(() => {
                let invoicesToRender: any[] = [];
                if (user?.role === 'admin' || user?.role === 'finance') {
                  invoicesToRender = [{
                    title: 'KOPERASI GARUDA MERAH PUTIH',
                    address: 'Dsn. Padangan RT 02 RW 03 Ds. Pagu',
                    district: 'Kec. Pagu Kab. Kediri',
                    phone: 'Phone : 0812-5278-8733',
                    items: printableItems,
                    getPrice: (item: any) => item.unitPrice || item.supplierCost || 0,
                    bankAccount: 'Rekening Koperasi Garuda Merah Putih\nBank Mandiri : 171-00-1986218-7',
                    signerName: 'Hariaji',
                    signerTitle: 'Ketua Koperasi',
                    useSignatureImg: true,
                    key: 'master-invoice',
                    invoiceNumber: invoiceOrder.poNumber || invoiceOrder.id
                  }];
                } else {
                  invoicesToRender = Array.from(new Set(printableItems.map(item => item.supplier || 'Belum Ditentukan'))).map((supplierName: any) => {
                    const sItems = printableItems.filter(item => (item.supplier || 'Belum Ditentukan') === supplierName);
                    
                    if (supplierName === 'Koperasi Garuda Merah Putih' || supplierName === 'KOPERASI GARUDA MERAH PUTIH') {
                      return {
                        title: 'KOPERASI GARUDA MERAH PUTIH',
                        address: 'Dsn. Padangan RT 02 RW 03 Ds. Pagu',
                        district: 'Kec. Pagu Kab. Kediri',
                        phone: 'Phone : 0812-5278-8733',
                        items: sItems,
                        getPrice: (item: any) => item.unitPrice || item.supplierCost || 0,
                        bankAccount: 'Rekening Koperasi Garuda Merah Putih\nBank Mandiri : 171-00-1986218-7',
                        signerName: 'Hariaji',
                        signerTitle: 'Ketua Koperasi',
                        useSignatureImg: true,
                        key: supplierName,
                        invoiceNumber: invoiceOrder.poNumber || invoiceOrder.id
                      };
                    }

                    const sUser = allUsers.find(u => u.name === supplierName);
                    
                    let title = (sUser?.name || supplierName).toUpperCase();
                    let address = sUser?.address || '';
                    let district = sUser?.district || '';
                    let phone = sUser?.phone ? `Phone : ${sUser.phone}` : '';
                    let signerName = '';
                    let bankAccount = (sUser?.bankAccountName || sUser?.bankAccountNumber)
                      ? `Rekening ${sUser.bankAccountName || '-'}\n${sUser.bankAccountNumber || '-'}`
                      : '-';
                      
                    const supplierInvoiceNumber = generateSupplierInvoiceNumber(invoiceOrder.id, supplierName, invoiceOrder.date);

                    return {
                      title,
                      address,
                      district,
                      phone,
                      items: sItems,
                      getPrice: (item: any) => item.supplierCost || 0,
                      bankAccount: bankAccount,
                      signerName,
                      signerTitle: '',
                      useSignatureImg: false,
                      key: supplierName,
                      invoiceNumber: supplierInvoiceNumber
                    };
                  });
                }

                return invoicesToRender.map((invoiceData, supIndex) => {
                  return (
                    <div key={invoiceData.key} className={`bg-white text-black p-8 sm:p-12 font-sans text-xs sm:text-sm shadow-xl border border-slate-300 lg:rounded-lg mb-8 print:mb-0 print:shadow-none print:border-none print:rounded-none ${supIndex > 0 ? 'print:break-before-page print:mt-12' : ''}`}>
                      <div className="min-w-[600px]">
                        {/* Header */}
                        <div className="text-center mb-6">
                          <h1 className="text-2xl font-bold border-2 border-black inline-block px-16 py-1 mb-2 tracking-widest">NOTA</h1>
                          <h2 className="text-xl font-bold uppercase">{invoiceData.title}</h2>
                          {invoiceData.address && <p>{invoiceData.address}</p>}
                          {invoiceData.district && <p>{invoiceData.district}</p>}
                          {invoiceData.phone && <p>{invoiceData.phone}</p>}
                        </div>

            {/* Info */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <table className="w-full">
                  <tbody>
                    <tr>
                      <td className="w-24">Nomor</td>
                      <td className="w-4">:</td>
                      <td>{invoiceData.invoiceNumber}</td>
                    </tr>
                    <tr>
                      <td>Tanggal Nota</td>
                      <td>:</td>
                      <td>{new Date(invoiceOrder.invoiceDate || invoiceOrder.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</td>
                    </tr>
                    {invoiceOrder.deliveryDate && (
                      <tr>
                        <td>Tanggal Kirim</td>
                        <td>:</td>
                        <td>{new Date(invoiceOrder.deliveryDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div>
                <p className="font-bold">Kepada :</p>
                <p className="font-bold">{invoiceOrder.clientName}</p>
                {allUsers.find(c => c.uid === invoiceOrder.clientId)?.address && (
                  <p>{allUsers.find(c => c.uid === invoiceOrder.clientId)?.address}</p>
                )}
                {allUsers.find(c => c.uid === invoiceOrder.clientId)?.district && (
                  <p>{allUsers.find(c => c.uid === invoiceOrder.clientId)?.district}</p>
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
                {/* Bahan Baku */}
                {invoiceData.items.filter((item: any) => item.category === 'Bahan Baku' || !item.category).length > 0 && (
                  <>
                    <tr className="bg-gray-100 font-bold">
                      <td colSpan={6} className="border border-black p-2">Bahan Baku</td>
                    </tr>
                    {invoiceData.items.filter((item: any) => item.category === 'Bahan Baku' || !item.category).map((item: any, index: number) => {
                      const qty = typeof item.quantity === 'string' ? parseFloat(item.quantity) : item.quantity;
                      const price = invoiceData.getPrice(item);
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
                      <td className="border border-black p-2 text-right font-bold">Subtotal Bahan Baku</td>
                      <td className="border border-black p-2 text-right font-bold">
                        {invoiceData.items.filter((item: any) => item.category === 'Bahan Baku' || !item.category).reduce((sum: number, item: any) => {
                          const qty = typeof item.quantity === 'string' ? parseFloat(item.quantity) : item.quantity;
                          const price = invoiceData.getPrice(item);
                          return sum + (qty * price);
                        }, 0).toLocaleString('id-ID')}
                      </td>
                    </tr>
                  </>
                )}

                {/* Bahan Operasional */}
                {invoiceData.items.filter((item: any) => item.category === 'Bahan Operasional').length > 0 && (
                  <>
                    <tr className="bg-gray-100 font-bold">
                      <td colSpan={6} className="border border-black p-2">Bahan Operasional</td>
                    </tr>
                    {invoiceData.items.filter((item: any) => item.category === 'Bahan Operasional').map((item: any, index: number) => {
                      const qty = typeof item.quantity === 'string' ? parseFloat(item.quantity) : item.quantity;
                      const price = invoiceData.getPrice(item);
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
                      <td className="border border-black p-2 text-right font-bold">Subtotal Bahan Operasional</td>
                      <td className="border border-black p-2 text-right font-bold">
                        {invoiceData.items.filter((item: any) => item.category === 'Bahan Operasional').reduce((sum: number, item: any) => {
                          const qty = typeof item.quantity === 'string' ? parseFloat(item.quantity) : item.quantity;
                          const price = invoiceData.getPrice(item);
                          return sum + (qty * price);
                        }, 0).toLocaleString('id-ID')}
                      </td>
                    </tr>
                  </>
                )}

                <tr>
                  <td colSpan={4} className="border-t border-black"></td>
                  <td className="border border-black p-2 text-right font-bold bg-gray-200">TOTAL KESELURUHAN</td>
                  <td className="border border-black p-2 text-right font-bold bg-gray-200">
                    {invoiceData.items.reduce((sum: number, item: any) => {
                      const qty = typeof item.quantity === 'string' ? parseFloat(item.quantity) : item.quantity;
                      const price = invoiceData.getPrice(item);
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
                {terbilang(invoiceData.items.reduce((sum: number, item: any) => {
                  const qty = typeof item.quantity === 'string' ? parseFloat(item.quantity) : item.quantity;
                  const price = invoiceData.getPrice(item);
                  return sum + (qty * price);
                }, 0))} Rupiah
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-between mt-8">
              <div>
                <p>BANK TRANSFER :</p>
                {invoiceData.bankAccount ? (
                  invoiceData.bankAccount.split('\n').map((line: string, i: number) => (
                    <p key={i}>{line}</p>
                  ))
                ) : (
                  <p>-</p>
                )}
              </div>
              <div className="text-center mr-12 w-48">
                <p className="mb-16">Hormat Kami,</p>
                {invoiceData.useSignatureImg && (
                  <img src="/signature.png" alt="Tanda Tangan" className="h-24 mx-auto object-contain mix-blend-multiply absolute -mt-20 ml-6" onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }} />
                )}
                <div className={`font-semibold text-sm pb-1 min-h-[24px] ${invoiceData.key !== 'master-invoice' ? 'border-b border-black' : ''}`}>
                  {invoiceData.signerName || ''}
                </div>
                {invoiceData.signerTitle && (
                  <p>{invoiceData.signerTitle}</p>
                )}
              </div>
            </div>
            </div>
          </div>
                );
              });
            })()}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const getProductHistory = () => {
    if (!productHistorySearchTerm) return [];
    
    const history: {
      orderId: string;
      date: string;
      deliveryDate?: string;
      poNumber: string;
      clientName: string;
      itemName: string;
      quantity: number | string;
      unit: string;
      price: number;
      hpp: number;
      supplierCost: number;
    }[] = [];

    const lowerSearch = productHistorySearchTerm.toLowerCase();

    orders.forEach(order => {
      order.items.forEach(item => {
        if (item.name.toLowerCase().includes(lowerSearch)) {
          history.push({
            orderId: order.id,
            date: order.date,
            deliveryDate: order.deliveryDate,
            poNumber: order.poNumber || order.id,
            clientName: order.clientName,
            itemName: item.name,
            quantity: item.quantity,
            unit: item.unit,
            price: item.unitPrice || 0,
            hpp: item.hpp || 0,
            supplierCost: item.supplierCost || 0
          });
        }
      });
    });

    // Sort by date descending
    return history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  const filteredOrders = orders.filter(o => 
    (o.clientName.toLowerCase().includes(searchQuery.toLowerCase()) || 
    o.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (o.poNumber && o.poNumber.toLowerCase().includes(searchQuery.toLowerCase())) ||
    o.items.some(item => item.name.toLowerCase().includes(searchQuery.toLowerCase()))) &&
    !(user.role === 'driver' && o.deliveredBy === 'Dikirim Supplier') &&
    !((user.role === 'supplier' || user.role === 'kitchen') && !o.items.some(item => item.supplier === user.name))
  ).sort((a, b) => {
    const poA = a.poNumber || a.id;
    const poB = b.poNumber || b.id;
    return poB.localeCompare(poA, undefined, { numeric: true, sensitivity: 'base' });
  });

  const renderKanbanCard = (order: PurchaseOrder, status: OrderStatus, customConfig?: { color: string, label: string }) => {
    const config = customConfig || statusConfig[status];
    return (
      <Card 
        key={order.id} 
        className="cursor-pointer hover:border-slate-400 transition-colors shadow-sm p-0 gap-0 shrink-0"
        onClick={() => {
          setSelectedOrder(order);
          setIsDetailOpen(true);
        }}
      >
        <CardHeader className="p-4 pb-2">
          <div className="flex justify-between items-start gap-2">
            <CardTitle className="text-sm font-bold text-slate-800 break-words">{order.poNumber || order.id}</CardTitle>
            <Badge className={`${config.color} shrink-0`} variant="outline">{config.label}</Badge>
          </div>
          <CardDescription className="text-xs mt-1 text-slate-500">
            {status === 'INVOICED' && order.invoiceDate 
              ? new Date(order.invoiceDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
              : new Date(order.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
            }
            {order.deliveryDate && (
              <span className="block mt-0.5 text-indigo-600 font-medium">
                Kirim: {new Date(order.deliveryDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <p className="font-medium text-slate-700 mb-2">{order.clientName}</p>
          
          {['INVOICED', 'DELIVERING', 'PO_RECEIVED'].includes(status) && expandedCards[order.id] && (
            <div className="mb-3 space-y-1">
              {order.items
                .filter(item => user.role !== 'supplier' || item.supplier === user.name)
                .map((item, idx) => (
                <div key={idx} className="text-xs text-slate-600 flex justify-between border-b border-slate-100 pb-1">
                  <span className="truncate pr-2">{item.name}</span>
                  <span className="shrink-0 font-medium">{item.quantity} {item.unit}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between text-xs text-slate-500">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                <Package className="w-3.5 h-3.5" />
                <span>{order.items.filter(item => user.role !== 'supplier' || item.supplier === user.name).length} items</span>
              </div>
              <div className="flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span>{order.items.filter(i => i.isReceived && (user.role !== 'supplier' || i.supplier === user.name)).length} diterima</span>
              </div>
            </div>
            {['INVOICED', 'DELIVERING', 'PO_RECEIVED'].includes(status) && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 px-2 text-xs"
                onClick={(e) => toggleCardExpand(e, order.id)}
              >
                {expandedCards[order.id] ? 'Tutup' : 'Detail'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  const renderKanbanColumn = (status: OrderStatus, customTitle?: string, customOrders?: PurchaseOrder[]) => {
    let columnOrders = customOrders || filteredOrders.filter(o => o.status === status);
    
    // Jika bukan admin/supplier/client, gabungkan INVOICED ke dalam COMPLETED
    if (status === 'COMPLETED' && user.role !== 'admin' && user.role !== 'supplier' && user.role !== 'client' && !customOrders) {
      columnOrders = filteredOrders.filter(o => o.status === 'COMPLETED' || o.status === 'INVOICED');
    }

    const config = statusConfig[status];
    const Icon = config.icon;

    // Filter for driver: only show ORDERING, DELIVERING, and AT_KITCHEN
    if (user.role === 'driver' && status !== 'ORDERING' && status !== 'DELIVERING' && status !== 'AT_KITCHEN') {
      return null;
    }

    return (
      <div key={customTitle || status} className="flex flex-col bg-slate-50 rounded-xl w-[85vw] sm:w-[300px] sm:min-w-[300px] sm:max-w-[350px] shrink-0 snap-center border border-slate-200 shadow-sm overflow-hidden">
        <div className={`flex items-center justify-between p-3 border-b border-slate-200/50 ${config.color.split(' ')[0]}`}>
          <div className={`flex items-center gap-2 ${config.color.split(' ')[1]}`}>
            <Icon className="w-5 h-5" />
            <h3 className="font-semibold">{customTitle || config.label}</h3>
          </div>
          <Badge variant="secondary" className="bg-white/60 text-slate-800 border-none">{columnOrders.length}</Badge>
        </div>
        
        <div className="flex flex-col gap-3 overflow-y-auto p-3 pr-2" style={{ maxHeight: 'calc(100vh - 240px)' }}>
          {columnOrders.map(order => renderKanbanCard(order, status))}
          {columnOrders.length === 0 && (
            <div className="text-center p-6 border-2 border-dashed border-slate-200 rounded-lg text-slate-400 text-sm">
              Tidak ada PO
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderCompletedColumnsPerClientForSupplier = () => {
    const completedOrInvoicedOrders = filteredOrders.filter(o => o.status === 'COMPLETED');
    if (completedOrInvoicedOrders.length === 0) {
      return renderKanbanColumn('COMPLETED');
    }

    const ordersByClient: Record<string, PurchaseOrder[]> = {
      'SPPG Ngasem': [],
      'SPPG Tugurejo': [],
      'Pagu': [] // You can add or adjust actual client names as observed from DB
    };
    
    // Fallback for an generic unmapped client just in case
    const otherClients: Record<string, PurchaseOrder[]> = {};

    completedOrInvoicedOrders.forEach(order => {
      // Find matching key (case-insensitive include check)
      if (order.clientName.toLowerCase().includes('ngasem')) {
        ordersByClient['SPPG Ngasem'].push(order);
      } else if (order.clientName.toLowerCase().includes('tugurejo')) {
        ordersByClient['SPPG Tugurejo'].push(order);
      } else if (order.clientName.toLowerCase().includes('pagu')) {
        ordersByClient['Pagu'].push(order);
      } else {
        if (!otherClients[order.clientName]) {
          otherClients[order.clientName] = [];
        }
        otherClients[order.clientName].push(order);
      }
    });

    const columns = [];
    
    // Always render these three, even if empty, per request:
    columns.push(
      <div key="Ngasem" className="flex flex-col bg-slate-50 rounded-xl w-[85vw] sm:w-[300px] sm:min-w-[300px] sm:max-w-[350px] shrink-0 snap-center border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b border-indigo-200/50 bg-indigo-100 text-indigo-800">
          <div className="flex items-center gap-2 text-indigo-800">
            <CheckCircle2 className="w-5 h-5" />
            <h3 className="font-semibold">Diterima Klien SPPG Ngasem</h3>
          </div>
          <Badge variant="secondary" className="bg-white/60 text-slate-800 border-none">{ordersByClient['SPPG Ngasem'].length}</Badge>
        </div>
        
        <div className="flex flex-col gap-3 overflow-y-auto p-3 pr-2" style={{ maxHeight: 'calc(100vh - 240px)' }}>
          {ordersByClient['SPPG Ngasem'].map(order => renderKanbanCard(order, 'COMPLETED', { color: 'bg-indigo-100 text-indigo-800', label: 'Selesai (Diterima Klien)' }))}
          {ordersByClient['SPPG Ngasem'].length === 0 && (
            <div className="text-center p-6 border-2 border-dashed border-slate-200 rounded-lg text-slate-400 text-sm">
              Tidak ada PO
            </div>
          )}
        </div>
      </div>
    );

    columns.push(
      <div key="Tugurejo" className="flex flex-col bg-slate-50 rounded-xl w-[85vw] sm:w-[300px] sm:min-w-[300px] sm:max-w-[350px] shrink-0 snap-center border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b border-sky-200/50 bg-sky-100 text-sky-800">
          <div className="flex items-center gap-2 text-sky-800">
            <CheckCircle2 className="w-5 h-5" />
            <h3 className="font-semibold">Diterima Klien SPPG Tugurejo</h3>
          </div>
          <Badge variant="secondary" className="bg-white/60 text-slate-800 border-none">{ordersByClient['SPPG Tugurejo'].length}</Badge>
        </div>
        
        <div className="flex flex-col gap-3 overflow-y-auto p-3 pr-2" style={{ maxHeight: 'calc(100vh - 240px)' }}>
          {ordersByClient['SPPG Tugurejo'].map(order => renderKanbanCard(order, 'COMPLETED', { color: 'bg-sky-100 text-sky-800', label: 'Selesai (Diterima Klien)' }))}
          {ordersByClient['SPPG Tugurejo'].length === 0 && (
            <div className="text-center p-6 border-2 border-dashed border-slate-200 rounded-lg text-slate-400 text-sm">
              Tidak ada PO
            </div>
          )}
        </div>
      </div>
    );

    columns.push(
      <div key="Pagu" className="flex flex-col bg-slate-50 rounded-xl w-[85vw] sm:w-[300px] sm:min-w-[300px] sm:max-w-[350px] shrink-0 snap-center border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b border-fuchsia-200/50 bg-fuchsia-100 text-fuchsia-800">
          <div className="flex items-center gap-2 text-fuchsia-800">
            <CheckCircle2 className="w-5 h-5" />
            <h3 className="font-semibold">Diterima Klien Pagu</h3>
          </div>
          <Badge variant="secondary" className="bg-white/60 text-slate-800 border-none">{ordersByClient['Pagu'].length}</Badge>
        </div>
        
        <div className="flex flex-col gap-3 overflow-y-auto p-3 pr-2" style={{ maxHeight: 'calc(100vh - 240px)' }}>
          {ordersByClient['Pagu'].map(order => renderKanbanCard(order, 'COMPLETED', { color: 'bg-fuchsia-100 text-fuchsia-800', label: 'Selesai (Diterima Klien)' }))}
          {ordersByClient['Pagu'].length === 0 && (
            <div className="text-center p-6 border-2 border-dashed border-slate-200 rounded-lg text-slate-400 text-sm">
              Tidak ada PO
            </div>
          )}
        </div>
      </div>
    );

    // Append any other clients if they exist
    Object.entries(otherClients).forEach(([clientName, orders]) => {
      columns.push(renderKanbanColumn('COMPLETED', `Diterima Klien ${clientName}`, orders));
    });

    return columns;
  };

  const renderInvoicedColumnsPerClient = () => {
    const invoicedOrders = filteredOrders.filter(o => o.status === 'INVOICED');
    if (invoicedOrders.length === 0) {
      return renderKanbanColumn('INVOICED');
    }

    const ordersByClient: Record<string, PurchaseOrder[]> = {};
    invoicedOrders.forEach(order => {
      if (!ordersByClient[order.clientName]) {
        ordersByClient[order.clientName] = [];
      }
      ordersByClient[order.clientName].push(order);
    });

    return Object.entries(ordersByClient).map(([clientName, orders]) => {
      return renderKanbanColumn('INVOICED', `Nota Dibuat - ${clientName}`, orders);
    });
  };

  const renderFinanceDashboard = () => {
    const invoicedOrders = filteredOrders.filter(o => o.status === 'INVOICED');
    
    let totalProfitAll = 0;
    const profitPerClient: Record<string, number> = {};

    invoicedOrders.forEach(order => {
      let orderProfit = 0;
      order.items.forEach(item => {
        const qty = typeof item.quantity === 'string' ? parseFloat(item.quantity) : item.quantity;
        const price = item.unitPrice || 0;
        const hpp = item.hpp || 0;
        orderProfit += (price - hpp) * qty;
      });
      totalProfitAll += orderProfit;
      
      if (!profitPerClient[order.clientName]) {
        profitPerClient[order.clientName] = 0;
      }
      profitPerClient[order.clientName] += orderProfit;
    });

    return (
      <div className="p-4 sm:p-6 max-w-7xl mx-auto w-full">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Receipt className="w-6 h-6 text-indigo-600" /> Dashboard Keuangan
          </h2>
          {invoicedOrders.length > 0 && (
            <Button onClick={handleExportToExcel} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              <Download className="w-4 h-4 mr-2" /> Download ke Excel (CSV)
            </Button>
          )}
        </div>
        
        {invoicedOrders.length === 0 ? (
          <div className="bg-white p-8 rounded-xl border border-slate-200 text-center shadow-sm">
            <p className="text-slate-500">Belum ada PO yang selesai dan dibuatkan nota.</p>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-6 items-start">
            <div className="flex-1 space-y-6 w-full">
              {invoicedOrders.map(order => {
                const orderTotalProfit = order.items.reduce((sum, item) => {
                  const qty = typeof item.quantity === 'string' ? parseFloat(item.quantity) : item.quantity;
                  const price = item.unitPrice || 0;
                  const hpp = item.hpp || 0;
                  return sum + ((price - hpp) * qty);
                }, 0);
                
                return (
                  <Card key={order.id} id={`finance-card-${order.id}`} className="overflow-hidden p-0 gap-0">
                    <CardHeader 
                      className="bg-slate-50 border-b border-slate-100 p-4 pb-4 cursor-pointer hover:bg-slate-100 transition-colors"
                      onClick={() => toggleFinanceCardExpand(order.id)}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-lg text-slate-800 flex items-center gap-2">
                            {expandedFinanceCards[order.id] ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
                            PO: {order.poNumber || order.id}
                          </CardTitle>
                          <CardDescription className="mt-1 text-slate-600 space-y-1">
                            <div>Klien: <span className="font-medium text-slate-800">{order.clientName}</span></div>
                            <div className="flex gap-4 text-xs">
                              <span>Nota: <span className="font-medium">{new Date(order.invoiceDate || order.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</span></span>
                              {order.deliveryDate && (
                                <span>Kirim: <span className="font-medium">{new Date(order.deliveryDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</span></span>
                              )}
                            </div>
                          </CardDescription>
                        </div>
                        <div className="text-right flex flex-col items-end gap-2">
                          <div className="flex gap-2">
                            {order.items.length > 0 && order.items.every(item => item.isTransferred) && (
                              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                DONE
                              </Badge>
                            )}
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                              INVOICED
                            </Badge>
                          </div>
                          <div className="text-sm font-bold text-emerald-700">
                            Rp {orderTotalProfit.toLocaleString('id-ID')}
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    
                    {expandedFinanceCards[order.id] && (
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Barang</TableHead>
                              <TableHead className="text-center">Qty</TableHead>
                              <TableHead className="text-right">Harga Jual</TableHead>
                              <TableHead className="text-right">HPP</TableHead>
                              <TableHead className="text-right">Keuntungan</TableHead>
                              <TableHead className="text-center w-[160px]">Status Transfer</TableHead>
                              <TableHead className="w-[100px]"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {order.items.map(item => {
                              const qty = typeof item.quantity === 'string' ? parseFloat(item.quantity) : item.quantity;
                              const price = item.unitPrice || 0;
                              const hpp = item.hpp || 0;
                              const profit = (price - hpp) * qty;
                              
                              return (
                                <TableRow key={item.id}>
                                  <TableCell>
                                    <div className="font-medium">{item.name}</div>
                                    <div className="text-xs text-slate-500">{item.supplier}</div>
                                  </TableCell>
                                  <TableCell className="text-center">{qty} {item.unit}</TableCell>
                                  <TableCell className="text-right">Rp {price.toLocaleString('id-ID')}</TableCell>
                                  <TableCell className="text-right">
                                    <HppInput item={item} orderId={order.id} handleUpdateHpp={handleUpdateHpp} />
                                  </TableCell>
                                  <TableCell className="text-right font-medium text-emerald-600">
                                    Rp {profit.toLocaleString('id-ID')}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <Button
                                      variant={item.isTransferred ? "default" : "outline"}
                                      size="sm"
                                      className={`w-full text-xs ${item.isTransferred ? 'bg-emerald-600 hover:bg-emerald-700' : 'text-slate-500'}`}
                                      onClick={() => toggleItemStatus(order.id, item.id, 'isTransferred')}
                                    >
                                      {item.isTransferred ? <CheckCircle2 className="w-3 h-3 mr-1" /> : <Clock className="w-3 h-3 mr-1" />}
                                      {item.isTransferred ? 'Sudah' : 'Belum'}
                                    </Button>
                                  </TableCell>
                                  <TableCell></TableCell>
                                </TableRow>
                              );
                            })}
                            <TableRow className="bg-slate-50 font-bold">
                              <TableCell colSpan={4} className="text-right text-slate-800">Total Keuntungan PO ini:</TableCell>
                              <TableCell className="text-right text-emerald-700">
                                Rp {orderTotalProfit.toLocaleString('id-ID')}
                              </TableCell>
                              <TableCell colSpan={2}></TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>

            <div className="w-full lg:w-80 shrink-0 space-y-4 sticky top-6">
              <Card className="bg-indigo-600 text-white border-none shadow-md p-0 gap-0">
                <CardContent className="p-6 flex flex-col gap-2">
                  <div className="text-indigo-100 text-sm font-medium">Total Keuntungan Keseluruhan</div>
                  <div className="text-3xl font-bold">Rp {totalProfitAll.toLocaleString('id-ID')}</div>
                </CardContent>
              </Card>

              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-slate-50 border-b border-slate-100 p-4">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <UserIcon className="w-4 h-4 text-slate-500" />
                    Rekap per Klien
                  </h3>
                </div>
                <div className="p-4 space-y-3">
                  {Object.entries(profitPerClient)
                    .sort(([, profitA], [, profitB]) => profitB - profitA)
                    .map(([client, profit]) => (
                    <div key={client} className="flex flex-col p-3 rounded-lg border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-colors">
                      <span className="text-sm font-medium text-slate-600 mb-1">{client}</span>
                      <span className="text-lg font-bold text-emerald-600">Rp {profit.toLocaleString('id-ID')}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-900 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex w-full md:w-auto items-center justify-between md:justify-start gap-3">
            <div className="flex items-center gap-2 sm:gap-3">
              <img 
                src="https://upload.wikimedia.org/wikipedia/commons/9/90/National_emblem_of_Indonesia_Garuda_Pancasila.svg" 
                alt="Garuda Pancasila" 
                className="w-8 h-8 sm:w-10 sm:h-10 object-contain"
                referrerPolicy="no-referrer"
              />
              <h1 className="text-base sm:text-xl font-bold text-slate-800 tracking-tight">PO Tracker</h1>
              <Badge variant="outline" className="uppercase bg-slate-100 text-[10px] sm:text-xs">{user.role}</Badge>
            </div>
            {/* Mobile logout button */}
            <Button variant="ghost" size="icon" onClick={handleLogout} title="Logout" className="md:hidden">
              <LogOut className="w-5 h-5 text-slate-500" />
            </Button>
          </div>
          
          <div className="flex flex-wrap w-full md:w-auto items-center gap-2">
            <div className="relative flex-1 md:flex-none min-w-[150px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input 
                placeholder="Cari PO, Klien, atau Barang..." 
                className="pl-9 w-full md:w-[250px] bg-slate-50 border-slate-200"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
              />
            </div>
            
            {user.role === 'admin' && (
              <>
              <Button 
                variant={currentView === 'finance' ? 'default' : 'outline'} 
                className={currentView === 'finance' ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm px-3 shrink-0' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50 shadow-sm px-3 shrink-0'}
                onClick={() => setCurrentView(currentView === 'kanban' ? 'finance' : 'kanban')}
              >
                <Receipt className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">{currentView === 'kanban' ? 'Keuangan' : 'Kanban'}</span>
              </Button>
              <Dialog open={isNewOpen} onOpenChange={setIsNewOpen}>
                <DialogTrigger render={<Button className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm px-3 shrink-0" />}>
                  <Plus className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">PO Baru</span>
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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                        <Label htmlFor="newPoDate">Tanggal PO <span className="text-red-500">*</span></Label>
                        <Input 
                          id="newPoDate"
                          type="date"
                          value={newPoDate}
                          onChange={(e) => setNewPoDate(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="newInvoiceDate">Tanggal Nota <span className="text-red-500">*</span></Label>
                        <Input 
                          id="newInvoiceDate"
                          type="date"
                          value={newInvoiceDate}
                          onChange={(e) => setNewInvoiceDate(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="newDeliveryDate">Tanggal Kirim</Label>
                        <Input 
                          id="newDeliveryDate"
                          type="date"
                          value={newDeliveryDate}
                          onChange={(e) => setNewDeliveryDate(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="newPoNumber">Nomor PO (Invoice)</Label>
                        <Input 
                          id="newPoNumber"
                          placeholder="Masukkan Nomor PO"
                          value={newPoNumber}
                          onChange={(e) => setNewPoNumber(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="newDeliveredBy">Dikirim Oleh</Label>
                        <select 
                          id="newDeliveredBy"
                          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                          value={newDeliveredBy}
                          onChange={(e) => setNewDeliveredBy(e.target.value as any)}
                        >
                          <option value="Dikirim Koperasi">Dikirim Koperasi</option>
                          <option value="Dikirim Supplier">Dikirim Supplier</option>
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
                              <TableHead className="w-[150px]">Harga Jual Ke Dapur</TableHead>
                              <TableHead className="w-[150px]">Harga Perolehan</TableHead>
                              <TableHead className="w-[150px]">Kategori</TableHead>
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
                                    value={item.supplierCost !== undefined ? (item.supplierCost ? new Intl.NumberFormat('id-ID').format(Number(item.supplierCost)) : '') : (item.unitPrice ? new Intl.NumberFormat('id-ID').format(Number(item.unitPrice)) : '')}
                                    onChange={(e) => {
                                      const val = e.target.value.replace(/\./g, '');
                                      if (/^\d*$/.test(val)) {
                                        const numVal = val === '' ? 0 : parseInt(val);
                                        const updated = [...newItems];
                                        updated[index] = { ...updated[index], unitPrice: numVal, supplierCost: numVal };
                                        setNewItems(updated);
                                      }
                                    }}
                                  />
                                </TableCell>
                                <TableCell className="p-2">
                                  <Input 
                                    type="text" 
                                    placeholder="0"
                                    value={item.hpp ? new Intl.NumberFormat('id-ID').format(Number(item.hpp)) : ''}
                                    onChange={(e) => {
                                      const val = e.target.value.replace(/\./g, '');
                                      if (/^\d*$/.test(val)) {
                                        const numVal = val === '' ? 0 : parseInt(val);
                                        handleItemChange(index, 'hpp', numVal);
                                      }
                                    }}
                                  />
                                </TableCell>
                                <TableCell className="p-2">
                                  <select
                                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                    value={item.category || 'Bahan Baku'}
                                    onChange={(e) => handleItemChange(index, 'category', e.target.value as 'Bahan Baku' | 'Bahan Operasional')}
                                  >
                                    <option value="Bahan Baku">Bahan Baku</option>
                                    <option value="Bahan Operasional">Bahan Operasional</option>
                                  </select>
                                </TableCell>
                                <TableCell className="p-2">
                                  <Input 
                                    placeholder="Nama supplier" 
                                    value={item.supplier}
                                    onChange={(e) => handleItemChange(index, 'supplier', e.target.value)}
                                  />
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

            {user.role === 'client' && (
               <Dialog open={isClientNewPoOpen} onOpenChange={setIsClientNewPoOpen}>
                 <DialogTrigger render={<Button className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm px-3 shrink-0" />}>
                   <Plus className="w-4 h-4 sm:mr-2" />
                   <span className="hidden sm:inline">+ PO Baru</span>
                 </DialogTrigger>
                 <DialogContent className="max-w-3xl sm:max-w-3xl w-[95vw] max-h-[90vh] overflow-y-auto">
                   <DialogHeader>
                     <DialogTitle>Buat Purchase Order Baru</DialogTitle>
                   </DialogHeader>
                   
                   {newPoError && (
                     <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm mb-4">
                       {newPoError}
                     </div>
                   )}

                   <div className="grid gap-6 py-4">
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                       <div className="space-y-2">
                         <Label htmlFor="clientPoDate">Tanggal PO <span className="text-red-500">*</span></Label>
                         <Input 
                           id="clientPoDate"
                           type="date"
                           value={clientPoDate}
                           onChange={(e) => setClientPoDate(e.target.value)}
                         />
                       </div>
                       <div className="space-y-2">
                         <Label htmlFor="clientDeliveryDate">Tanggal Kirim</Label>
                         <Input 
                           id="clientDeliveryDate"
                           type="date"
                           value={clientDeliveryDate}
                           onChange={(e) => setClientDeliveryDate(e.target.value)}
                         />
                       </div>
                     </div>
                     <div className="space-y-2">
                       <div className="flex justify-between items-center mb-2">
                         <Label>Daftar Barang <span className="text-red-500">*</span></Label>
                         <Button type="button" variant="outline" size="sm" onClick={() => setClientItems([...clientItems, { name: '', quantity: 1, unit: 'pcs', category: 'Bahan Baku', supplier: '' }])}>
                           <Plus className="w-4 h-4 mr-2" /> Tambah Barang
                         </Button>
                       </div>
                       <div className="border rounded-md overflow-x-auto">
                         <Table className="min-w-[800px]">
                           <TableHeader className="bg-slate-50">
                             <TableRow>
                               <TableHead>Nama Barang <span className="text-red-500">*</span></TableHead>
                               <TableHead className="w-[100px]">Qty <span className="text-red-500">*</span></TableHead>
                               <TableHead className="w-[100px]">Satuan</TableHead>
                               <TableHead className="w-[150px]">Kategori</TableHead>
                               <TableHead className="w-[150px]">Supplier</TableHead>
                               <TableHead className="w-[60px] text-center">Aksi</TableHead>
                             </TableRow>
                           </TableHeader>
                           <TableBody>
                             {clientItems.map((item, index) => (
                               <TableRow key={index}>
                                 <TableCell className="p-2">
                                   <Input 
                                     placeholder="Nama barang..." 
                                     value={item.name}
                                     onChange={(e) => {
                                       const newIt = [...clientItems];
                                       newIt[index].name = e.target.value;
                                       setClientItems(newIt);
                                     }}
                                   />
                                 </TableCell>
                                 <TableCell className="p-2">
                                   <Input 
                                     type="number"
                                     step="0.01"
                                     min="0.1"
                                     value={item.quantity}
                                     onChange={(e) => {
                                       const newIt = [...clientItems];
                                       newIt[index].quantity = e.target.value;
                                       setClientItems(newIt);
                                     }}
                                   />
                                 </TableCell>
                                 <TableCell className="p-2">
                                   <Input 
                                     placeholder="kg, pcs..." 
                                     value={item.unit}
                                     onChange={(e) => {
                                       const newIt = [...clientItems];
                                       newIt[index].unit = e.target.value;
                                       setClientItems(newIt);
                                     }}
                                   />
                                 </TableCell>
                                  <TableCell className="p-2">
                                    <select
                                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                      value={item.category || 'Bahan Baku'}
                                      onChange={(e) => {
                                        const newIt = [...clientItems];
                                        newIt[index].category = e.target.value as 'Bahan Baku' | 'Bahan Operasional';
                                        setClientItems(newIt);
                                      }}
                                    >
                                      <option value="Bahan Baku">Bahan Baku</option>
                                      <option value="Bahan Operasional">Bahan Operasional</option>
                                    </select>
                                  </TableCell>
                                  <TableCell className="p-2">
                                    <select
                                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                      value={item.supplier || ''}
                                      onChange={(e) => {
                                        const newIt = [...clientItems];
                                        newIt[index].supplier = e.target.value;
                                        setClientItems(newIt);
                                      }}
                                    >
                                      <option value="" disabled>Pilih Supplier</option>
                                      <option value="Koperasi Garuda Merah Putih">Koperasi Garuda Merah Putih</option>
                                      <option value="Puji Sayur dan Buah">Puji Sayur dan Buah</option>
                                      <option value="UD Srikaya Berkah Rejeki">UD Srikaya Berkah Rejeki</option>
                                      <option value="UD Airlangga Putra Mas">UD Airlangga Putra Mas</option>
                                      <option value="UD Wahyu Lumbung Rejeki">UD Wahyu Lumbung Rejeki</option>
                                      <option value="Hiqba Madani">Hiqba Madani</option>
                                      <option value="Cipta Tirta Mandiri">Cipta Tirta Mandiri</option>
                                    </select>
                                  </TableCell>
                                 <TableCell className="p-2 text-center">
                                   <Button 
                                     type="button" 
                                     variant="ghost" 
                                     size="icon" 
                                     className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                     onClick={() => setClientItems(clientItems.filter((_, i) => i !== index))}
                                     disabled={clientItems.length === 1}
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
                     <Button variant="outline" onClick={() => setIsClientNewPoOpen(false)}>Batal</Button>
                     <Button onClick={handleClientCreatePO} className="bg-indigo-600 hover:bg-indigo-700">Simpan PO</Button>
                   </DialogFooter>
                 </DialogContent>
               </Dialog>
            )}

            {user.role === 'client' && (
              <Dialog open={isClientEditPoOpen} onOpenChange={setIsClientEditPoOpen}>
                <DialogContent className="max-w-3xl sm:max-w-3xl w-[95vw] max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Edit Purchase Order</DialogTitle>
                    <DialogDescription>Perbarui detail PO Anda. PO yang sudah diproses tidak dapat diedit.</DialogDescription>
                  </DialogHeader>
                  
                  {editError && (
                    <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm mb-4">
                      {editError}
                    </div>
                  )}

                  <div className="grid gap-6 py-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="clientEditPoDate">Tanggal PO <span className="text-red-500">*</span></Label>
                        <Input 
                          id="clientEditPoDate"
                          type="date"
                          value={clientEditPoDate}
                          onChange={(e) => setClientEditPoDate(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="clientEditDeliveryDate">Tanggal Kirim</Label>
                        <Input 
                          id="clientEditDeliveryDate"
                          type="date"
                          value={clientEditDeliveryDate}
                          onChange={(e) => setClientEditDeliveryDate(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="clientEditPoNumber">Nomor PO</Label>
                        <Input 
                          id="clientEditPoNumber"
                          placeholder="Nomor PO"
                          value={clientEditPoNumber}
                          onChange={(e) => setClientEditPoNumber(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center mb-2">
                        <Label>Daftar Barang <span className="text-red-500">*</span></Label>
                        <Button type="button" variant="outline" size="sm" onClick={() => setClientEditItems([...clientEditItems, { name: '', quantity: 1, unit: 'pcs', category: 'Bahan Baku', supplier: '' }])}>
                          <Plus className="w-4 h-4 mr-2" /> Tambah Barang
                        </Button>
                      </div>
                      <div className="border rounded-md overflow-x-auto">
                        <Table className="min-w-[800px]">
                          <TableHeader className="bg-slate-50">
                            <TableRow>
                              <TableHead>Nama Barang <span className="text-red-500">*</span></TableHead>
                              <TableHead className="w-[100px]">Qty <span className="text-red-500">*</span></TableHead>
                              <TableHead className="w-[100px]">Satuan</TableHead>
                              <TableHead className="w-[150px]">Kategori</TableHead>
                              <TableHead className="w-[150px]">Supplier</TableHead>
                              <TableHead className="w-[60px] text-center">Aksi</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {clientEditItems.map((item, index) => (
                              <TableRow key={index}>
                                <TableCell className="p-2">
                                  <Input 
                                    placeholder="Nama barang..." 
                                    value={item.name}
                                    onChange={(e) => {
                                      const newIt = [...clientEditItems];
                                      newIt[index].name = e.target.value;
                                      setClientEditItems(newIt);
                                    }}
                                  />
                                </TableCell>
                                <TableCell className="p-2">
                                  <Input 
                                    type="number"
                                    step="0.01"
                                    min="0.1"
                                    value={item.quantity}
                                    onChange={(e) => {
                                      const newIt = [...clientEditItems];
                                      newIt[index].quantity = e.target.value;
                                      setClientEditItems(newIt);
                                    }}
                                  />
                                </TableCell>
                                <TableCell className="p-2">
                                  <Input 
                                    placeholder="kg, pcs..." 
                                    value={item.unit}
                                    onChange={(e) => {
                                      const newIt = [...clientEditItems];
                                      newIt[index].unit = e.target.value;
                                      setClientEditItems(newIt);
                                    }}
                                  />
                                </TableCell>
                                <TableCell className="p-2">
                                  <select
                                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                    value={item.category || 'Bahan Baku'}
                                    onChange={(e) => {
                                      const newIt = [...clientEditItems];
                                      newIt[index].category = e.target.value as 'Bahan Baku' | 'Bahan Operasional';
                                      setClientEditItems(newIt);
                                    }}
                                  >
                                    <option value="Bahan Baku">Bahan Baku</option>
                                    <option value="Bahan Operasional">Bahan Operasional</option>
                                  </select>
                                </TableCell>
                                <TableCell className="p-2">
                                  <select
                                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                    value={item.supplier || ''}
                                    onChange={(e) => {
                                      const newIt = [...clientEditItems];
                                      newIt[index].supplier = e.target.value;
                                      setClientEditItems(newIt);
                                    }}
                                  >
                                    <option value="" disabled>Pilih Supplier</option>
                                    <option value="Koperasi Garuda Merah Putih">Koperasi Garuda Merah Putih</option>
                                    <option value="Puji Sayur dan Buah">Puji Sayur dan Buah</option>
                                    <option value="UD Srikaya Berkah Rejeki">UD Srikaya Berkah Rejeki</option>
                                    <option value="UD Airlangga Putra Mas">UD Airlangga Putra Mas</option>
                                    <option value="UD Wahyu Lumbung Rejeki">UD Wahyu Lumbung Rejeki</option>
                                    <option value="Hiqba Madani">Hiqba Madani</option>
                                    <option value="Cipta Tirta Mandiri">Cipta Tirta Mandiri</option>
                                  </select>
                                </TableCell>
                                <TableCell className="p-2 text-center">
                                  <Button 
                                    type="button" 
                                    variant="ghost" 
                                    size="icon" 
                                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                    onClick={() => setClientEditItems(clientEditItems.filter((_, i) => i !== index))}
                                    disabled={clientEditItems.length === 1}
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
                    <Button variant="outline" onClick={() => setIsClientEditPoOpen(false)}>Batal</Button>
                    <Button onClick={handleClientUpdatePO} className="bg-indigo-600 hover:bg-indigo-700">Perbarui PO</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                        <Label htmlFor="editPoDate">Tanggal PO <span className="text-red-500">*</span></Label>
                        <Input 
                          id="editPoDate"
                          type="date"
                          value={editPoDate}
                          onChange={(e) => setEditPoDate(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="editInvoiceDate">Tanggal Nota <span className="text-red-500">*</span></Label>
                        <Input 
                          id="editInvoiceDate"
                          type="date"
                          value={editInvoiceDate}
                          onChange={(e) => setEditInvoiceDate(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="editDeliveryDate">Tanggal Kirim</Label>
                        <Input 
                          id="editDeliveryDate"
                          type="date"
                          value={editDeliveryDate}
                          onChange={(e) => setEditDeliveryDate(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="editPoNumber">Nomor PO (Invoice)</Label>
                        <Input 
                          id="editPoNumber"
                          placeholder="Masukkan Nomor PO"
                          value={editPoNumber}
                          onChange={(e) => setEditPoNumber(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="editDeliveredBy">Dikirim Oleh</Label>
                        <select 
                          id="editDeliveredBy"
                          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          value={editDeliveredBy}
                          onChange={(e) => setEditDeliveredBy(e.target.value as any)}
                        >
                          <option value="Dikirim Koperasi">Dikirim Koperasi</option>
                          <option value="Dikirim Supplier">Dikirim Supplier</option>
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
                              <TableHead className="w-[150px]">Harga Jual Ke Dapur</TableHead>
                              <TableHead className="w-[150px]">Harga Perolehan</TableHead>
                              <TableHead className="w-[150px]">Kategori</TableHead>
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
                                  <Input 
                                    type="text"
                                    placeholder="Satuan"
                                    value={item.unit}
                                    onChange={(e) => handleEditItemChange(index, 'unit', e.target.value)}
                                  />
                                </TableCell>
                                <TableCell className="p-2">
                                  <Input 
                                    type="text" 
                                    placeholder="0"
                                    value={item.supplierCost !== undefined ? (item.supplierCost ? new Intl.NumberFormat('id-ID').format(Number(item.supplierCost)) : '') : (item.unitPrice ? new Intl.NumberFormat('id-ID').format(Number(item.unitPrice)) : '')}
                                    onChange={(e) => {
                                      const val = e.target.value.replace(/\./g, '');
                                      if (/^\d*$/.test(val)) {
                                        const numVal = val === '' ? 0 : parseInt(val);
                                        const updated = [...editItems];
                                        updated[index] = { ...updated[index], unitPrice: numVal, supplierCost: numVal };
                                        setEditItems(updated);
                                      }
                                    }}
                                  />
                                </TableCell>
                                <TableCell className="p-2">
                                  <Input 
                                    type="text" 
                                    placeholder="0"
                                    value={item.hpp ? new Intl.NumberFormat('id-ID').format(Number(item.hpp)) : ''}
                                    onChange={(e) => {
                                      const val = e.target.value.replace(/\./g, '');
                                      if (/^\d*$/.test(val)) {
                                        const numVal = val === '' ? 0 : parseInt(val);
                                        handleEditItemChange(index, 'hpp', numVal);
                                      }
                                    }}
                                  />
                                </TableCell>
                                <TableCell className="p-2">
                                  <select
                                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                    value={item.category || 'Bahan Baku'}
                                    onChange={(e) => handleEditItemChange(index, 'category', e.target.value as 'Bahan Baku' | 'Bahan Operasional')}
                                  >
                                    <option value="Bahan Baku">Bahan Baku</option>
                                    <option value="Bahan Operasional">Bahan Operasional</option>
                                  </select>
                                </TableCell>
                                <TableCell className="p-2">
                                  <Input 
                                    placeholder="Nama supplier" 
                                    value={item.supplier}
                                    onChange={(e) => handleEditItemChange(index, 'supplier', e.target.value)}
                                  />
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
                  <DialogTrigger render={<Button variant="outline" className="bg-white text-slate-700 border-slate-300 hover:bg-slate-50 shadow-sm px-3 shrink-0" />}>
                    <Plus className="w-4 h-4 sm:mr-2" />
                    <span className="hidden sm:inline">Tambah Klien</span>
                  </DialogTrigger>
                  <DialogContent className="max-w-md w-[95vw] max-h-[90vh] overflow-y-auto">
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
                <DialogTrigger render={<Button variant="outline" className="bg-white text-slate-700 border-slate-300 hover:bg-slate-50 shadow-sm px-3 shrink-0" />}>
                  <Package className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Kelola Supplier</span>
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
                            <TableHead className="text-base">Nama Penandatangan</TableHead>
                            <TableHead className="text-base">Telepon</TableHead>
                            <TableHead className="text-base">Alamat</TableHead>
                            <TableHead className="text-base">Kecamatan/Kabupaten</TableHead>
                            <TableHead className="text-base">Bank Transfer + Rekening</TableHead>
                            <TableHead className="w-[120px] text-center text-base">Aksi</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {suppliers.map((s) => (
                            <TableRow key={s.id}>
                              <TableCell className="font-medium text-base">{s.name}</TableCell>
                              <TableCell className="text-base">{s.picName || '-'}</TableCell>
                              <TableCell className="text-base">{s.phone || '-'}</TableCell>
                              <TableCell className="text-base">{s.address || '-'}</TableCell>
                              <TableCell className="text-base">{s.district || '-'}</TableCell>
                              <TableCell className="text-base">{s.bankAccount || '-'}</TableCell>
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
                              <TableCell colSpan={6} className="text-center text-slate-500 py-4">Belum ada data supplier.</TableCell>
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
                <DialogTrigger render={<Button variant="outline" className="bg-white text-slate-700 border-slate-300 hover:bg-slate-50 shadow-sm px-3 shrink-0" />}>
                  <UserIcon className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Kelola Pengguna</span>
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
                            <TableHead className="text-sm">Nama</TableHead>
                            <TableHead className="text-sm">Email</TableHead>
                            <TableHead className="text-sm">Telepon</TableHead>
                            <TableHead className="text-sm">Alamat</TableHead>
                            <TableHead className="text-sm">Kecamatan/Kabupaten</TableHead>
                            <TableHead className="text-sm">Nama Rekening</TableHead>
                            <TableHead className="text-sm">Nomor Rekening</TableHead>
                            <TableHead className="w-[150px] text-sm">Role</TableHead>
                            <TableHead className="w-[120px] text-center text-sm">Aksi</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {allUsers.map((u) => (
                            <TableRow key={u.uid}>
                              <TableCell className="font-medium text-sm">{u.name}</TableCell>
                              <TableCell className="text-sm">{u.email}</TableCell>
                              <TableCell className="text-sm">{u.phone || '-'}</TableCell>
                              <TableCell className="text-sm">{u.address || '-'}</TableCell>
                              <TableCell className="text-sm">{u.district || '-'}</TableCell>
                              <TableCell className="text-sm">{u.bankAccountName || '-'}</TableCell>
                              <TableCell className="text-sm">{u.bankAccountNumber || '-'}</TableCell>
                              <TableCell>
                                <select 
                                  className="flex h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer hover:bg-slate-50"
                                  value={u.role}
                                  onChange={(e) => handleUpdateUserRole(u.uid, e.target.value)}
                                >
                                  <option value="admin">Admin</option>
                                  <option value="supplier">Supplier</option>
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
                <DialogContent className="w-[95vw] sm:max-w-md rounded-lg">
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
                <DialogContent className="max-w-md w-[95vw] max-h-[90vh] overflow-y-auto">
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
                    <div className="space-y-2">
                      <Label htmlFor="editUserBankAccountName">Nama Rekening</Label>
                      <Input 
                        id="editUserBankAccountName" 
                        value={editUserBankAccountName}
                        onChange={(e) => setEditUserBankAccountName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="editUserBankAccountNumber">Nomor Rekening</Label>
                      <Input 
                        id="editUserBankAccountNumber" 
                        value={editUserBankAccountNumber}
                        onChange={(e) => setEditUserBankAccountNumber(e.target.value)}
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
                <DialogContent className="w-[95vw] sm:max-w-md rounded-lg">
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
                <DialogContent className="max-w-md w-[95vw] max-h-[90vh] overflow-y-auto">
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
                      <Label htmlFor="supplierPicName">Nama Penandatangan</Label>
                      <Input 
                        id="supplierPicName" 
                        value={supplierPicName}
                        onChange={(e) => setSupplierPicName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="supplierBankAccount">Bank Transfer + Rekening</Label>
                      <Input 
                        id="supplierBankAccount" 
                        value={supplierBankAccount}
                        onChange={(e) => setSupplierBankAccount(e.target.value)}
                        placeholder="Contoh: Bank Mandiri : 171-00-1986218-7"
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
                <DialogContent className="max-w-md w-[95vw] max-h-[90vh] overflow-y-auto">
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
                      <Label htmlFor="editSupplierPicName">Nama Penandatangan</Label>
                      <Input 
                        id="editSupplierPicName" 
                        value={supplierPicName}
                        onChange={(e) => setSupplierPicName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="editSupplierBankAccount">Bank Transfer + Rekening</Label>
                      <Input 
                        id="editSupplierBankAccount" 
                        value={supplierBankAccount}
                        onChange={(e) => setSupplierBankAccount(e.target.value)}
                        placeholder="Contoh: Bank Mandiri : 171-00-1986218-7"
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
                <DialogContent className="w-[95vw] sm:max-w-md rounded-lg">
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

            <div className="hidden md:flex items-center gap-3 ml-4 pl-4 border-l border-slate-200">
              <div className="text-right">
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

      {/* Main Content */}
      <main className="flex-1 overflow-x-auto p-4 sm:p-6 snap-x snap-mandatory">
        {globalSuccess && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 p-4 rounded-lg mb-6 flex justify-between items-center max-w-7xl mx-auto">
            <span>{globalSuccess}</span>
            <Button variant="ghost" size="sm" onClick={() => setGlobalSuccess(null)}>Tutup</Button>
          </div>
        )}
        {globalError && (
          <div className="bg-red-50 border border-red-200 text-red-600 p-4 rounded-lg mb-6 flex justify-between items-center max-w-7xl mx-auto">
            <span>{globalError}</span>
            <Button variant="ghost" size="sm" onClick={() => setGlobalError(null)}>Tutup</Button>
          </div>
        )}
        
        {currentView === 'finance' ? (
          renderFinanceDashboard()
        ) : (
          <div className="flex gap-4 sm:gap-6 min-w-max pb-4">
            {user.role !== 'kitchen' && renderKanbanColumn('PO_RECEIVED')}
            {user.role !== 'kitchen' && renderKanbanColumn('ORDERING')}
            {user.role !== 'kitchen' && renderKanbanColumn('DELIVERING')}
            {user.role !== 'kitchen' && renderKanbanColumn('AT_KITCHEN')}
            {user.role === 'supplier' ? renderCompletedColumnsPerClientForSupplier() : renderKanbanColumn('COMPLETED')}
            {user.role === 'admin' && renderInvoicedColumnsPerClient()}
            {(user.role === 'supplier' || user.role === 'client') && renderKanbanColumn('INVOICED')}
          </div>
        )}
      </main>

      {/* Product History Modal */}
      <Dialog open={isProductHistoryOpen} onOpenChange={setIsProductHistoryOpen}>
        <DialogContent className="max-w-4xl sm:max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">
              Riwayat Barang: <span className="text-indigo-600">{productHistorySearchTerm}</span>
            </DialogTitle>
            <DialogDescription>
              Menampilkan riwayat pemesanan untuk barang yang dicari.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {getProductHistory().length === 0 ? (
              <div className="text-center text-slate-500 py-8">
                Tidak ada riwayat pemesanan untuk barang ini.
              </div>
            ) : (
              <div className="border rounded-md overflow-x-auto">
                <Table className="min-w-[800px]">
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead>Tanggal Kirim</TableHead>
                      <TableHead>PO / Klien</TableHead>
                      <TableHead>Barang</TableHead>
                      <TableHead className="text-center">Qty</TableHead>
                      {user.role === 'supplier' ? (
                        <>
                          <TableHead className="text-right">Harga Perolehan</TableHead>
                          <TableHead className="text-right">Harga Jual Ke Dapur</TableHead>
                        </>
                      ) : (
                        <>
                          <TableHead className="text-right">Harga Satuan</TableHead>
                          {(user.role === 'admin' || user.role === 'finance') && (
                            <TableHead className="text-right">HPP</TableHead>
                          )}
                        </>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {getProductHistory().map((history, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          {history.deliveryDate 
                            ? new Date(history.deliveryDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
                            : new Date(history.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
                          }
                        </TableCell>
                        <TableCell>
                          <div 
                            className="font-medium text-indigo-600 hover:underline cursor-pointer"
                            onClick={() => {
                              setIsProductHistoryOpen(false);
                              setCurrentView('finance');
                              setExpandedFinanceCards(prev => ({ ...prev, [history.orderId]: true }));
                              // Add a small delay to allow the DOM to render the finance view before scrolling
                              setTimeout(() => {
                                const element = document.getElementById(`finance-card-${history.orderId}`);
                                if (element) {
                                  element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                }
                              }, 100);
                            }}
                          >
                            {history.poNumber}
                          </div>
                          <div className="text-xs text-slate-500">{history.clientName}</div>
                        </TableCell>
                        <TableCell className="font-medium">{history.itemName}</TableCell>
                        <TableCell className="text-center">{history.quantity} {history.unit}</TableCell>
                        {user.role === 'supplier' ? (
                          <>
                            <TableCell className="text-right text-slate-700">Rp {(history.hpp || 0).toLocaleString('id-ID')}</TableCell>
                            <TableCell className="text-right text-emerald-600">Rp {(history.supplierCost || 0).toLocaleString('id-ID')}</TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell className="text-right">Rp {(history.price || 0).toLocaleString('id-ID')}</TableCell>
                            {(user.role === 'admin' || user.role === 'finance') && (
                              <TableCell className="text-right text-emerald-600">Rp {(history.hpp || 0).toLocaleString('id-ID')}</TableCell>
                            )}
                          </>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setIsProductHistoryOpen(false)}>Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Modal */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-4xl sm:max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto">
          {selectedOrder && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between pr-6">
                  <DialogTitle className="text-xl flex items-center gap-3">
                    {selectedOrder.poNumber || selectedOrder.id}
                    <Badge className={statusConfig[selectedOrder.status].color} variant="outline">
                      {statusConfig[selectedOrder.status].label}
                    </Badge>
                  </DialogTitle>
                  <div className="flex gap-2">
                    {(selectedOrder.status === 'COMPLETED' || selectedOrder.status === 'INVOICED') && user.role === 'admin' && (
                      <Button variant="outline" size="sm" className="bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100" onClick={async () => {
                        handleOpenInvoice(selectedOrder);
                        if (selectedOrder.status === 'COMPLETED') {
                          try {
                            await updateDoc(doc(db, 'purchaseOrders', selectedOrder.id), {
                              status: 'INVOICED'
                            });
                          } catch (error) {
                            console.error("Error updating status to INVOICED:", error);
                          }
                        }
                      }}>
                        <Receipt className="w-4 h-4 mr-2" /> Cetak Nota
                      </Button>
                    )}
                    {(selectedOrder.status === 'COMPLETED' || selectedOrder.status === 'INVOICED') && user.role === 'client' && (
                      <Button variant="outline" size="sm" className="bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100" onClick={async () => {
                        handleOpenInvoice(selectedOrder);
                        if (selectedOrder.status === 'COMPLETED') {
                          try {
                            await updateDoc(doc(db, 'purchaseOrders', selectedOrder.id), {
                              status: 'INVOICED'
                            });
                          } catch (error) {
                            console.error("Error updating status to INVOICED:", error);
                          }
                        }
                      }}>
                        <Receipt className="w-4 h-4 mr-2" /> Cetak Nota
                      </Button>
                    )}
                    {user.role === 'supplier' && selectedOrder.items.some(item => item.supplier === user.name) && (
                      <Button variant="outline" size="sm" className="bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100" onClick={() => handleRekapSupplier(user.name)}>
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
                    {user.role === 'client' && (selectedOrder.status === 'PO_RECEIVED' || selectedOrder.status === 'ORDERING') && (
                      <Button variant="outline" size="sm" onClick={() => openEditPO(selectedOrder)}>
                        <Edit className="w-4 h-4 mr-2" /> Edit PO
                      </Button>
                    )}
                  </div>
                </div>
                <DialogDescription className="text-slate-500 mt-1">
                  Diterima pada {new Date(selectedOrder.date).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  {selectedOrder.deliveryDate && (
                    <span className="block mt-1 text-indigo-600 font-medium">
                      Tanggal Kirim: {new Date(selectedOrder.deliveryDate).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    </span>
                  )}
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-6 py-4">
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                  <p className="text-sm text-slate-500 mb-1">Klien</p>
                  <p className="font-semibold text-slate-800 text-lg">{selectedOrder.clientName}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                  <p className="text-sm text-slate-500 mb-1">
                    {user?.role === 'supplier' ? 'Total Jumlah Transfer' : 'Catatan'}
                  </p>
                  <p className="font-medium text-slate-700">
                    {user?.role === 'supplier'
                      ? (() => {
                          const items = selectedOrder.items.filter(item => item.supplier === user.name);
                          const totalTransfer = items.reduce((sum, item) => sum + (((item.supplierCost || 0) - (item.hpp || 0)) * (typeof item.quantity === 'string' ? parseFloat(item.quantity) : item.quantity)), 0);
                          return `Rp ${totalTransfer.toLocaleString('id-ID')}`;
                        })()
                      : (selectedOrder.notes || '-')
                    }
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-semibold text-slate-800 text-lg border-b pb-2">Daftar Kebutuhan & Status</h3>
                
                {/* Mobile View */}
                <div className="block xl:hidden space-y-4">
                  {selectedOrder.items
                    .filter(item => user.role !== 'supplier' || item.supplier === user.name)
                    .map((item) => (
                      <div key={item.id} className={`border p-4 rounded-xl flex flex-col gap-4 shadow-sm ${item.isReceived ? 'bg-emerald-50/50' : 'bg-white'}`}>
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-bold text-slate-800 text-base">{item.name}</div>
                            <div className="text-sm border inline-flex items-center justify-center font-bold px-2 py-1 mt-1 bg-slate-100 rounded text-slate-600">{item.quantity} {item.unit}</div>
                          </div>
                          <Badge variant="outline" className="bg-white text-slate-600 font-normal">
                            {item.supplier}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-2 gap-2 mt-2">
                          {!(user.role === 'driver' && selectedOrder.deliveredBy === 'Dikirim Supplier') && user.role !== 'kitchen' && (
                            <>
                              <Button
                                variant={item.isOrdered ? "default" : "outline"}
                                size="sm"
                                disabled={user.role !== 'supplier' && user.role !== 'admin' && user.role !== 'client'}
                                className={`w-full ${item.isOrdered ? 'bg-indigo-600 hover:bg-indigo-700' : 'text-slate-500'}`}
                                onClick={() => toggleItemStatus(selectedOrder.id, item.id, 'isOrdered')}
                              >
                                {item.isOrdered ? <CheckCircle2 className="w-4 h-4 mr-1" /> : <Clock className="w-4 h-4 mr-1" />}
                                {item.isOrdered ? 'Diorder' : 'Diorder?'}
                              </Button>
                              <Button
                                variant={item.isDelivered ? "default" : "outline"}
                                size="sm"
                                disabled={user.role !== 'driver' && user.role !== 'admin' && user.role !== 'client' && user.role !== 'supplier'}
                                className={`w-full ${item.isDelivered ? 'bg-blue-600 hover:bg-blue-700' : 'text-slate-500'}`}
                                onClick={() => toggleItemStatus(selectedOrder.id, item.id, 'isDelivered')}
                              >
                                {item.isDelivered ? <CheckCircle2 className="w-4 h-4 mr-1" /> : <Truck className="w-4 h-4 mr-1" />}
                                {item.isDelivered ? 'Dikirim' : 'Dikirim?'}
                              </Button>
                              {user.role !== 'supplier' && (
                                <Button
                                  variant={item.isAtKitchen ? "default" : "outline"}
                                  size="sm"
                                  disabled={user.role !== 'supplier' && user.role !== 'admin' && user.role !== 'driver' && user.role !== 'client'}
                                  className={`w-full ${item.isAtKitchen ? 'bg-orange-600 hover:bg-orange-700' : 'text-slate-500'}`}
                                  onClick={() => toggleItemStatus(selectedOrder.id, item.id, 'isAtKitchen')}
                                >
                                  {item.isAtKitchen ? <CheckCircle2 className="w-4 h-4 mr-1" /> : <Package className="w-4 h-4 mr-1" />}
                                  {item.isAtKitchen ? 'Sp Dapur' : 'Sp Dapur?'}
                                </Button>
                              )}
                            </>
                          )}
                          <Button
                            variant={item.isReceived ? "default" : "outline"}
                            size="sm"
                            disabled={user.role !== 'client' && user.role !== 'admin'}
                            className={`w-full ${item.isReceived ? 'bg-emerald-600 hover:bg-emerald-700' : 'text-slate-500'}`}
                            onClick={() => toggleItemStatus(selectedOrder.id, item.id, 'isReceived')}
                          >
                            {item.isReceived ? <CheckCircle2 className="w-4 h-4 mr-1" /> : <Clock className="w-4 h-4 mr-1" />}
                            {item.isReceived ? 'Diterima' : 'Diterima?'}
                          </Button>
                        </div>

                        {(user.role === 'admin' || user.role === 'supplier' || user.role === 'kitchen') && (
                          <div className="bg-slate-50/80 p-3 rounded-lg border border-slate-200 space-y-3 mt-1 shadow-inner">
                            {user.role === 'supplier' && (
                              <div>
                                <Label className="text-xs text-slate-500 font-semibold uppercase tracking-wider block mb-1.5">Harga Perolehan</Label>
                                <HppInput item={item} orderId={selectedOrder.id} handleUpdateHpp={handleUpdateHpp} />
                              </div>
                            )}
                            <div>
                              <Label className="text-xs text-slate-500 font-semibold uppercase tracking-wider block mb-1.5">
                                {user.role === 'supplier' ? 'Harga Jual Ke Dapur' : 'HPP'}
                              </Label>
                              {user.role === 'supplier' ? (
                                <SupplierCostInput item={item} orderId={selectedOrder.id} handleUpdateSupplierCost={handleUpdateSupplierCost} />
                              ) : (
                                <HppInput item={item} orderId={selectedOrder.id} handleUpdateHpp={handleUpdateHpp} />
                              )}
                            </div>
                            
                            {user.role === 'supplier' && (
                              <div className="pt-3 border-t border-slate-300 flex justify-between items-center">
                                <span className="text-sm font-semibold text-slate-600">Jumlah Transfer</span>
                                <span className="font-bold text-indigo-700 text-lg">
                                  Rp {(((item.supplierCost || 0) - (item.hpp || 0)) * (typeof item.quantity === 'string' ? parseFloat(item.quantity) : item.quantity)).toLocaleString('id-ID')}
                                </span>
                              </div>
                            )}

                            <div className="pt-3 border-t border-slate-200/50 flex gap-2">
                              <Button
                                variant={item.isTransferred ? "default" : "outline"}
                                size="sm"
                                className={`flex-1 ${item.isTransferred ? 'bg-emerald-600 hover:bg-emerald-700' : 'text-slate-500'}`}
                                onClick={() => toggleItemStatus(selectedOrder.id, item.id, 'isTransferred')}
                                disabled={user.role !== 'admin' && user.role !== 'supplier' && user.role !== 'kitchen'}
                              >
                                {item.isTransferred ? <CheckCircle2 className="w-4 h-4 mr-1" /> : <Clock className="w-4 h-4 mr-1" />}
                                {item.isTransferred ? 'Telah Ditransfer' : 'Belum Ditransfer'}
                              </Button>
                              {user.role !== 'supplier' && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="flex-1 text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                                  onClick={() => handleRekapSupplier(item.supplier)}
                                  disabled={!item.supplier}
                                >
                                  <MessageSquare className="w-4 h-4 mr-1" />
                                  Rekap
                                </Button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                </div>

                {/* Desktop View */}
                <div className="hidden xl:block border rounded-md overflow-x-auto">
                  <Table className="min-w-[800px]">
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead>Barang</TableHead>
                        <TableHead>Supplier</TableHead>
                        {!(user.role === 'driver' && selectedOrder.deliveredBy === 'Dikirim Supplier') && user.role !== 'kitchen' && (
                          <>
                            <TableHead className="text-center w-[120px]">Diorder?</TableHead>
                            <TableHead className="text-center w-[120px]">Dikirim?</TableHead>
                            {user.role !== 'supplier' && (
                              <TableHead className="text-center w-[120px]">Sampai Dapur?</TableHead>
                            )}
                          </>
                        )}
                        <TableHead className="text-center w-[120px]">Diterima Klien?</TableHead>
                        {(user.role === 'admin' || user.role === 'supplier' || user.role === 'kitchen') && (
                          <>
                            {user.role === 'supplier' && <TableHead className="text-right w-[140px]">Harga Perolehan</TableHead>}
                            <TableHead className="text-right w-[120px]">{user.role === 'supplier' ? 'Harga Jual Ke Dapur' : 'HPP'}</TableHead>
                            {user.role === 'supplier' && <TableHead className="text-right w-[130px]">Jumlah Transfer</TableHead>}
                            <TableHead className="text-center w-[120px]">Status Transfer</TableHead>
                            {user.role !== 'supplier' && (
                              <TableHead className="text-center w-[120px]">Rekap Supplier</TableHead>
                            )}
                          </>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedOrder.items
                        .filter(item => user.role !== 'supplier' || item.supplier === user.name)
                        .map((item) => (
                        <TableRow key={item.id} className={item.isReceived ? 'bg-emerald-50/50' : ''}>
                          <TableCell>
                            <div className="font-medium text-slate-800">{item.name}</div>
                            <div className="text-xs text-slate-500">{item.quantity} {item.unit}</div>
                          </TableCell>
                          
                          <TableCell>
                            <Badge variant="outline" className="bg-white text-slate-600 font-normal">
                              {item.supplier}
                            </Badge>
                          </TableCell>

                          {!(user.role === 'driver' && selectedOrder.deliveredBy === 'Dikirim Supplier') && user.role !== 'kitchen' && (
                            <>
                              <TableCell className="text-center">
                                <Button
                                  variant={item.isOrdered ? "default" : "outline"}
                                  size="sm"
                                  disabled={user.role !== 'supplier' && user.role !== 'admin' && user.role !== 'client'}
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
                                  disabled={user.role !== 'driver' && user.role !== 'admin' && user.role !== 'client' && user.role !== 'supplier'}
                                  className={`w-full ${item.isDelivered ? 'bg-blue-600 hover:bg-blue-700' : 'text-slate-500'}`}
                                  onClick={() => toggleItemStatus(selectedOrder.id, item.id, 'isDelivered')}
                                >
                                  {item.isDelivered ? <CheckCircle2 className="w-4 h-4 mr-1" /> : <Truck className="w-4 h-4 mr-1" />}
                                  {item.isDelivered ? 'Ya' : 'Belum'}
                                </Button>
                              </TableCell>
                              {user.role !== 'supplier' && (
                                <TableCell className="text-center">
                                  <Button
                                    variant={item.isAtKitchen ? "default" : "outline"}
                                    size="sm"
                                    disabled={user.role !== 'supplier' && user.role !== 'admin' && user.role !== 'driver' && user.role !== 'client'}
                                    className={`w-full ${item.isAtKitchen ? 'bg-orange-600 hover:bg-orange-700' : 'text-slate-500'}`}
                                    onClick={() => toggleItemStatus(selectedOrder.id, item.id, 'isAtKitchen')}
                                  >
                                    {item.isAtKitchen ? <CheckCircle2 className="w-4 h-4 mr-1" /> : <Package className="w-4 h-4 mr-1" />}
                                    {item.isAtKitchen ? 'Ya' : 'Belum'}
                                  </Button>
                                </TableCell>
                              )}
                            </>
                          )}

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
                          {(user.role === 'admin' || user.role === 'supplier' || user.role === 'kitchen') && (
                            <>
                              {user.role === 'supplier' && (
                                <TableCell className="text-right">
                                  <HppInput item={item} orderId={selectedOrder.id} handleUpdateHpp={handleUpdateHpp} />
                                </TableCell>
                              )}
                              <TableCell className="text-right">
                                {user.role === 'supplier' ? (
                                  <SupplierCostInput item={item} orderId={selectedOrder.id} handleUpdateSupplierCost={handleUpdateSupplierCost} />
                                ) : (
                                  <HppInput item={item} orderId={selectedOrder.id} handleUpdateHpp={handleUpdateHpp} />
                                )}
                              </TableCell>
                              {user.role === 'supplier' && (
                                <TableCell className="text-right font-medium text-indigo-600 whitespace-nowrap">
                                  Rp {(((item.supplierCost || 0) - (item.hpp || 0)) * (typeof item.quantity === 'string' ? parseFloat(item.quantity) : item.quantity)).toLocaleString('id-ID')}
                                </TableCell>
                              )}
                              <TableCell className="text-center">
                                <Button
                                  variant={item.isTransferred ? "default" : "outline"}
                                  size="sm"
                                  className={`w-full ${item.isTransferred ? 'bg-emerald-600 hover:bg-emerald-700' : 'text-slate-500'}`}
                                  onClick={() => toggleItemStatus(selectedOrder.id, item.id, 'isTransferred')}
                                  disabled={user.role !== 'admin' && user.role !== 'supplier' && user.role !== 'kitchen'}
                                >
                                  {item.isTransferred ? <CheckCircle2 className="w-4 h-4 mr-1" /> : <Clock className="w-4 h-4 mr-1" />}
                                  {item.isTransferred ? 'Sudah' : 'Belum'}
                                </Button>
                              </TableCell>
                              {user.role !== 'supplier' && (
                                <TableCell className="text-center">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                                    onClick={() => handleRekapSupplier(item.supplier)}
                                    disabled={!item.supplier}
                                  >
                                    <MessageSquare className="w-4 h-4 mr-1" />
                                    Rekap
                                  </Button>
                                </TableCell>
                              )}
                            </>
                          )}
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

