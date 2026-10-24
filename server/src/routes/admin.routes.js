import { Router } from 'express';
import * as C from '../controllers/admin.controller.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = Router();
// Every admin route requires a valid session AND the admin role (checked against the database).
router.use(authenticate, requireAdmin);

router.get('/stats', C.stats);
router.get('/reports', C.report);

router.get('/rooms', C.listRooms);
router.post('/rooms', C.createRoom);
router.put('/rooms/:id', C.updateRoom);
router.patch('/rooms/:id/active', C.setRoomActive);

router.get('/hotels', C.listHotels);
router.get('/room-types', C.listTypes);
router.post('/room-types', C.createType);
router.put('/room-types/:id', C.updateType);
router.get('/amenities', C.listAmenities);

router.get('/bookings', C.listBookings);
router.patch('/bookings/:id/status', C.updateBookingStatus);
router.patch('/bookings/:id/stay', C.updateStayStatus);

router.get('/customers', C.listCustomers);
router.get('/customers/:id', C.customerDetail);
router.patch('/customers/:id/active', C.setCustomerActive);

export default router;
