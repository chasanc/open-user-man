cmake_minimum_required(VERSION 3.16)
project(oum_integration_cpp CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(Protobuf REQUIRED)
find_package(gRPC CONFIG REQUIRED)

set(PROTO ${CMAKE_CURRENT_SOURCE_DIR}/../../packages/proto/open-user-management.proto)
get_filename_component(PROTO_DIR ${PROTO} DIRECTORY)
set(GEN ${CMAKE_CURRENT_BINARY_DIR}/gen)
file(MAKE_DIRECTORY ${GEN})

# Generate message and service stubs from the shared proto.
add_custom_command(
  OUTPUT ${GEN}/open-user-management.pb.cc ${GEN}/open-user-management.grpc.pb.cc
  COMMAND protobuf::protoc
  ARGS --proto_path=${PROTO_DIR} --cpp_out=${GEN} --grpc_out=${GEN}
       --plugin=protoc-gen-grpc=$<TARGET_FILE:gRPC::grpc_cpp_plugin> ${PROTO}
  DEPENDS ${PROTO})

add_executable(oum_check main.cpp
  ${GEN}/open-user-management.pb.cc ${GEN}/open-user-management.grpc.pb.cc)
target_include_directories(oum_check PRIVATE ${GEN})
target_link_libraries(oum_check PRIVATE gRPC::grpc++ protobuf::libprotobuf)
